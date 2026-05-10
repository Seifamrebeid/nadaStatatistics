"""Classroom capture app — main entry point.

Standalone desktop program launched on the classroom PC at the start of a
lecture. Opens the webcam + mic, identifies enrolled students, classifies
emotion + sleep state + gesture per face per interval, writes observations to
Firestore + CSV, and streams live transcription to Firestore.

Multi-face tracker architecture
-------------------------------
    every frame  -> MediaPipe Face Mesh + Hands
                 -> match each mesh face to an existing FaceTrack by IoU
                    (unmatched mesh face => new track)
                 -> EMA-smooth the track's bounding box
                 -> sleep_detector.classify_sleep (per-student history)
                 -> gesture_detector.classify_gesture + GestureHistory

    every N      -> face_recognition.face_locations + identify against enrolled
                    encodings; attach student_id to the matched track
                 -> FER emotion classification per track
                 -> YOLOv8 phone detection + per-track "on phone" flag
                 -> save_observation for tracks whose student_id is not unknown

Quit with 'q' in the OpenCV window.
"""

# TF/Keras deprecation chatter — must be silenced before any TF import.
import os
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
# Windows OpenMP-runtime collision: torch + MKL-linked numpy/ctranslate2 each
# ship their own libiomp5md.dll. Intel's documented workaround.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
import logging, warnings
logging.getLogger("tensorflow").setLevel(logging.ERROR)
logging.getLogger("absl").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning, module="google.*")

import importlib
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import requests
from dotenv import load_dotenv

import firebase_writer
import face_id
import emotion as emotion_mod
from engagement import engagement_score
from attention_detector import (
    attention_score,
    attention_warning,
    cheat_score,
    cheating_warning,
    recommendation_text,
)
from sleep_detector import SleepHistory, classify_sleep, init_face_mesh
from gesture_detector import (
    GestureHistory,
    assign_hand_to_face,
    classify_gesture,
    init_hands,
)
try:
    from audio_recorder import AudioRecorder
except Exception as _ar_err:
    print(f"[capture] audio_recorder unavailable ({_ar_err}); continuing without audio.")
    class AudioRecorder:  # type: ignore[override]
        def start(self, lecture_id): pass
        def add_listener(self, fn): pass
        def stop(self): return None

# Optional dependency path: if faster-whisper/av is unavailable, keep
# capture running without live transcription instead of crashing on import.
try:
    from stream_transcribe import StreamTranscriber
except Exception as _st_err:
    print(f"[capture] stream_transcribe unavailable ({_st_err}); continuing without transcript.")
    class StreamTranscriber:  # type: ignore[override]
        def __init__(self, **kwargs): pass
        def start(self, lecture_id): pass
        def feed(self, chunk): return None
        def stop(self): pass
try:
    from phone_detector import detect_phones, hand_on_phone, phone_near_face
except Exception:
    def detect_phones(frame):
        return []

    def hand_on_phone(hand_landmarks, phone_boxes, w, h):
        return False

    def phone_near_face(phone_box, face_box):
        return False
from yawn_detector import YawnHistory, classify_yawn, hand_over_mouth

try:
    mp = importlib.import_module("mediapipe")
except Exception:
    mp = None


_LINE_H = 13
_BOX_EMA_ALPHA = 0.45      # box smoothing: lower = smoother/laggier
_MIN_IOU_MATCH = 0.3       # mesh face to track association
_MIN_IOU_ID_MATCH = 0.2    # face_recognition box to track association (looser)
_MAX_MISSED_FRAMES = 15    # drop a track after this many frames with no mesh match


def _pick_lecture(db) -> Tuple[str, dict]:
    lectures = list(
        db.collection("lectures")
        .where("status", "in", ["scheduled", "recording"])
        .stream()
    )
    if not lectures:
        print("No scheduled or recording lectures found. Create one first.")
        sys.exit(2)
    print("Available lectures:")
    for i, doc in enumerate(lectures, start=1):
        d = doc.to_dict()
        print(f"  {i}. {d.get('title', doc.id)}  (doctor={d.get('doctor_id')},"
              f" status={d.get('status')})")
    while True:
        choice = input(f"Select lecture [1-{len(lectures)}]: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(lectures):
            picked = lectures[int(choice) - 1]
            return picked.id, picked.to_dict()


def _landmarks_bbox(landmarks, w: int, h: int):
    xs = [lm.x * w for lm in landmarks]
    ys = [lm.y * h for lm in landmarks]
    return (int(min(ys)), int(max(xs)), int(max(ys)), int(min(xs)))


def _ema_box(new_box, prev_box, alpha: float = _BOX_EMA_ALPHA):
    if prev_box is None:
        return new_box
    return tuple(int(alpha * n + (1 - alpha) * p)
                 for n, p in zip(new_box, prev_box))


def _iou(b1, b2) -> float:
    """IoU of two (top, right, bottom, left) boxes."""
    t1, r1, b_1, l1 = b1
    t2, r2, b_2, l2 = b2
    inter_t = max(t1, t2)
    inter_l = max(l1, l2)
    inter_b = min(b_1, b_2)
    inter_r = min(r1, r2)
    if inter_b <= inter_t or inter_r <= inter_l:
        return 0.0
    inter = (inter_b - inter_t) * (inter_r - inter_l)
    a1 = max(0, b_1 - t1) * max(0, r1 - l1)
    a2 = max(0, b_2 - t2) * max(0, r2 - l2)
    denom = a1 + a2 - inter
    return inter / denom if denom > 0 else 0.0


def _draw_stack(frame, box, lines, color) -> None:
    """Stack labels above the face box (or below if no room above)."""
    top, right, bottom, left = box
    cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
    total_h = _LINE_H * len(lines)
    start_y = top - 8 - total_h
    if start_y < 15:
        start_y = bottom + _LINE_H + 5
    max_w = max((cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)[0][0]
                 for line in lines), default=0)
    cv2.rectangle(frame, (left - 2, start_y - _LINE_H),
                  (left + max_w + 6, start_y - _LINE_H + total_h + 4),
                  (0, 0, 0), cv2.FILLED)
    frame_h = frame.shape[0]
    for i, line in enumerate(lines):
        yy = start_y + i * _LINE_H
        if yy >= frame_h:
            break
        cv2.putText(frame, line, (left + 2, yy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1, cv2.LINE_AA)


def _draw_subtitle(frame, text: str) -> None:
    if not text:
        return
    h, w = frame.shape[:2]
    shown = text.strip()
    max_chars = max(24, w // 13)
    if len(shown) > max_chars:
        shown = shown[: max_chars - 1] + "…"
    y2 = h - 10
    y1 = max(10, y2 - 34)
    cv2.rectangle(frame, (12, y1), (w - 12, y2), (0, 0, 0), cv2.FILLED)
    cv2.putText(frame, shown, (22, y2 - 12), cv2.FONT_HERSHEY_SIMPLEX,
                0.7, (255, 255, 255), 2, cv2.LINE_AA)


class FaceTrack:
    __slots__ = (
        "track_id", "box", "student_id", "name",
        "sleep_hist", "gesture_hist", "yawn_hist",
        "last_emotion", "last_conf",
        "last_state", "last_reason", "last_gesture", "last_score",
        "last_attention", "last_attention_warning",
        "last_cheat_score", "last_cheat_warning",
        "last_yawning", "last_yawn_reason",
        "on_phone", "missed_frames",
    )

    def __init__(self, track_id: int, box):
        self.track_id = track_id
        self.box = box
        self.student_id = "unknown"
        self.name = "unknown"
        self.sleep_hist = SleepHistory()
        self.gesture_hist = GestureHistory()
        self.yawn_hist = YawnHistory()
        self.last_emotion = "neutral"
        self.last_conf = 0.0
        self.last_state = "awake"
        self.last_reason: Optional[str] = None
        self.last_gesture = "none"
        self.last_score = 0.0
        self.last_attention = 0.0
        self.last_attention_warning = False
        self.last_cheat_score = 0.0
        self.last_cheat_warning = False
        self.last_yawning = False
        self.last_yawn_reason: Optional[str] = None
        self.on_phone = False
        self.missed_frames = 0


def main() -> int:
    """CLI entry — interactive lecture pick, opens cv2.imshow live window."""
    load_dotenv(Path(__file__).with_name(".env"), override=True)
    db = firebase_writer.init_firebase()
    lecture_id, lecture_doc = _pick_lecture(db)
    return run_capture(lecture_id, lecture_doc)


def run_capture(
    lecture_id: str,
    lecture_doc: dict,
    *,
    on_frame=None,
    on_log=None,
    stop_event=None,
) -> int:
    """Run the detection pipeline against a chosen lecture.

    on_frame(frame_bgr): receives annotated BGR frames; if None, falls back
        to cv2.imshow (legacy CLI behaviour).
    on_log(message): replaces stdout prints (UI log panel).
    stop_event (threading.Event): when set, loop exits cleanly. If None, the
        loop exits when the user presses 'q' in the cv2 window.
    """
    _log = on_log if on_log is not None else print
    load_dotenv(Path(__file__).with_name(".env"), override=True)
    db = firebase_writer.init_firebase()

    _log(f"Recording lecture: {lecture_id} — {lecture_doc.get('title')}")
    firebase_writer.set_lecture_status(lecture_id, "recording")

    enrolled, names = face_id.load_enrolled_encodings(db, lecture_id)
    _log(f"Loaded {len(enrolled)} enrolled face encoding(s).")

    latest_subtitle = ""

    def _on_subtitle(text: str, start: float, end: float) -> None:
        nonlocal latest_subtitle
        latest_subtitle = text

    try:
        mp_face_mesh = init_face_mesh(max_num_faces=8)
        mp_hands = init_hands(max_num_hands=8)
    except Exception as e:
        _log(f"MediaPipe init failed ({e}); running face ID + emotion only.")
        mp_face_mesh = None
        mp_hands = None

    recorder = AudioRecorder()
    transcriber = StreamTranscriber(on_segment=_on_subtitle)
    try:
        recorder.start(lecture_id)
        recorder.add_listener(transcriber.feed)
        transcriber.start(lecture_id)
    except Exception as e:
        _log(f"Audio/transcription init failed ({e}); continuing video-only.")

    camera_index = int(os.getenv("CAMERA_INDEX", "0"))
    cap_w = int(os.getenv("CAMERA_WIDTH", "640"))
    cap_h = int(os.getenv("CAMERA_HEIGHT", "480"))
    cap_fps = int(os.getenv("CAMERA_FPS", "30"))

    # CAP_DSHOW backend on Windows starts the camera much faster and respects
    # FRAME_WIDTH/HEIGHT/FPS reliably (the default MSMF backend often ignores
    # them). On non-Windows the backend flag is harmless if undefined.
    if os.name == "nt":
        cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        _log(f"Could not open camera at index {camera_index}")
        return 3
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, cap_w)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cap_h)
    cap.set(cv2.CAP_PROP_FPS, cap_fps)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    _log(f"Camera open: {actual_w}x{actual_h} @ requested {cap_fps} fps")

    process_every_n = int(os.getenv("PROCESS_EVERY_N_FRAMES", "30"))
    save_interval = float(os.getenv("SAVE_INTERVAL_SECONDS", "3"))
    tolerance = float(os.getenv("FACE_MATCH_TOLERANCE", "0.6"))
    exam_mode = str(lecture_doc.get("mode", "")).lower() == "exam" or \
        os.getenv("EXAM_MODE", "false").lower() in {"1", "true", "yes", "y"}

    tracks: Dict[int, FaceTrack] = {}
    next_track_id = 0
    last_phone_boxes: List[Tuple[int, int, int, int]] = []

    _marked_present: set = set()
    _last_warned: Dict[str, float] = {}
    _WARNING_COOLDOWN = 30.0

    frame_idx = 0
    last_flush = time.time()
    last_rec_flush = time.time()
    total_rows = 0

    def _persist_track(tr: FaceTrack, *, subtitle_text: str = "", face_count: int = 1) -> None:
        tr.last_attention = attention_score(
            state=tr.last_state,
            on_phone=tr.on_phone,
            yawning=tr.last_yawning,
            gesture=tr.last_gesture,
            emotion=tr.last_emotion,
            face_count=face_count,
        )
        tr.last_attention_warning = attention_warning(tr.last_attention)
        tr.last_cheat_score = cheat_score(
            exam_mode=exam_mode,
            on_phone=tr.on_phone,
            attention=tr.last_attention,
            face_count=face_count,
        )
        tr.last_cheat_warning = cheating_warning(tr.last_cheat_score)

        if tr.student_id != "unknown":
            # Auto-mark attendance on first detection
            if tr.student_id not in _marked_present:
                _marked_present.add(tr.student_id)
                class_id = lecture_doc.get("class_id")
                subject_id = lecture_doc.get("subject_id")
                doctor_id = lecture_doc.get("doctor_id")
                try:
                    firebase_writer.mark_attendance_present(
                        lecture_id, tr.student_id, class_id, subject_id, doctor_id
                    )
                    _log(f"attendance: marked {tr.student_id} present (auto)")
                except Exception as e:
                    _log(f"attendance write failed: {e}")

            # Fire warning events with cooldown
            now_t = time.time()
            warn_key_att = f"{tr.student_id}_att"
            warn_key_cheat = f"{tr.student_id}_cheat"
            if tr.last_attention_warning:
                if now_t - _last_warned.get(warn_key_att, 0) >= _WARNING_COOLDOWN:
                    _last_warned[warn_key_att] = now_t
                    try:
                        firebase_writer.write_warning(
                            tr.student_id, lecture_id, "attention", tr.last_attention
                        )
                    except Exception as e:
                        _log(f"warning write failed: {e}")
            if tr.last_cheat_warning:
                if now_t - _last_warned.get(warn_key_cheat, 0) >= _WARNING_COOLDOWN:
                    _last_warned[warn_key_cheat] = now_t
                    try:
                        firebase_writer.write_warning(
                            tr.student_id, lecture_id, "cheating", tr.last_cheat_score
                        )
                    except Exception as e:
                        _log(f"warning write failed: {e}")

            firebase_writer.save_observation(
                student_id=tr.student_id,
                lecture_id=lecture_id,
                emotion=tr.last_emotion,
                confidence=tr.last_conf,
                state=tr.last_state,
                sleep_reason=tr.last_reason,
                gesture=tr.last_gesture,
                engagement_score=tr.last_score,
                yawning=tr.last_yawning,
                yawn_reason=tr.last_yawn_reason,
                attention_score=tr.last_attention,
                attention_warning=tr.last_attention_warning,
                cheat_score=tr.last_cheat_score,
                cheat_warning=tr.last_cheat_warning,
                subtitle_text=subtitle_text or None,
                face_count=face_count,
            )

    try:
        while True:
            if stop_event is not None and stop_event.is_set():
                break
            ok, frame = cap.read()
            if not ok:
                _log("Frame read failed; stopping.")
                break
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            if mp_face_mesh is not None and mp_hands is not None:
                mesh_res = mp_face_mesh.process(rgb)
                hand_res = mp_hands.process(rgb)

                # ---- Every frame: match mesh faces to tracks ----
                mesh_faces = mesh_res.multi_face_landmarks or []
                raw_boxes = [_landmarks_bbox(f.landmark, w, h) for f in mesh_faces]

                matched: Dict[int, int] = {}  # mesh_idx -> track_id
                used_tids: set = set()
                for mi, rbox in enumerate(raw_boxes):
                    best_tid, best_iou = None, _MIN_IOU_MATCH
                    for tid, tr in tracks.items():
                        if tid in used_tids:
                            continue
                        iou = _iou(rbox, tr.box)
                        if iou > best_iou:
                            best_iou = iou
                            best_tid = tid
                    if best_tid is None:
                        best_tid = next_track_id
                        next_track_id += 1
                        tracks[best_tid] = FaceTrack(best_tid, rbox)
                    matched[mi] = best_tid
                    used_tids.add(best_tid)

                # Decay unmatched tracks.
                for tid in list(tracks.keys()):
                    if tid not in used_tids:
                        tracks[tid].missed_frames += 1
                        if tracks[tid].missed_frames > _MAX_MISSED_FRAMES:
                            del tracks[tid]
                    else:
                        tracks[tid].missed_frames = 0

                # EMA-smooth per-track box + run sleep + yawn on every matched track.
                all_hands = hand_res.multi_hand_landmarks or []
                mouth_boxes: Dict[int, Tuple[int, int, int, int]] = {}
                for mi, tid in matched.items():
                    tr = tracks[tid]
                    tr.box = _ema_box(raw_boxes[mi], tr.box)
                    lm = mesh_faces[mi].landmark
                    state, reason = classify_sleep(lm, (w, h), tr.sleep_hist)
                    tr.last_state = state
                    tr.last_reason = reason
                    yawning, y_reason, mbox = classify_yawn(
                        lm, (w, h), all_hands, tr.yawn_hist,
                    )
                    tr.last_yawning = yawning
                    tr.last_yawn_reason = y_reason
                    mouth_boxes[tid] = mbox

                # Hand attribution (every frame) + gesture classification.
                face_centers: List[Tuple[float, float]] = []
                tids_in_order: List[int] = []
                for mi, tid in matched.items():
                    t, r, b, l = tracks[tid].box
                    face_centers.append(((l + r) / 2.0, (t + b) / 2.0))
                    tids_in_order.append(tid)

                # Filter out hands occupied by a phone or covering any face's mouth —
                # a hand holding a phone / covering a yawning mouth can't
                # simultaneously hand_raise / thumbs_up / etc.
                free_hands: List = []
                free_hand_centers: List[Tuple[float, float]] = []
                mouth_box_list = list(mouth_boxes.values())
                for hl in all_hands:
                    if hand_on_phone(hl, last_phone_boxes, w, h):
                        continue
                    if any(hand_over_mouth(hl, mbox, w, h) for mbox in mouth_box_list):
                        continue
                    free_hands.append(hl)
                    free_hand_centers.append((hl.landmark[0].x * w, hl.landmark[0].y * h))
                hand_attr = assign_hand_to_face(free_hand_centers, face_centers)

                for face_idx, hand_idx in hand_attr.items():
                    tid = tids_in_order[face_idx]
                    tr = tracks[tid]
                    raw_g = "none"
                    if hand_idx is not None:
                        raw_g = classify_gesture(
                            free_hands[hand_idx],
                            face_ref=face_centers[face_idx],
                        )
                    tr.last_gesture = tr.gesture_hist.push(raw_g)
            else:
                detections = face_id.detect_and_identify(rgb, enrolled, tolerance=tolerance)
                matched: Dict[int, int] = {}
                used_tids: set = set()
                for di, det in enumerate(detections):
                    rbox = det["box"]
                    best_tid, best_iou = None, _MIN_IOU_MATCH
                    for tid, tr in tracks.items():
                        if tid in used_tids:
                            continue
                        iou = _iou(rbox, tr.box)
                        if iou > best_iou:
                            best_iou = iou
                            best_tid = tid
                    if best_tid is None:
                        best_tid = next_track_id
                        next_track_id += 1
                        tracks[best_tid] = FaceTrack(best_tid, rbox)
                    tracks[best_tid].box = rbox
                    tracks[best_tid].missed_frames = 0
                    matched[di] = best_tid
                    used_tids.add(best_tid)

                for tid in list(tracks.keys()):
                    if tid not in used_tids:
                        tracks[tid].missed_frames += 1
                        if tracks[tid].missed_frames > _MAX_MISSED_FRAMES:
                            del tracks[tid]

                for di, tid in matched.items():
                    tr = tracks[tid]
                    sid = detections[di]["student_id"]
                    tr.student_id = sid
                    tr.name = names.get(sid, sid)
                    top, right, bottom, left = tr.box
                    face_rect = (left, top, right - left, bottom - top)
                    emo = emotion_mod.detect_emotion(frame, face_rect=face_rect)
                    tr.last_emotion = emo["emotion"]
                    tr.last_conf = emo["confidence"]
                    tr.last_state = "awake"
                    tr.last_reason = None
                    tr.last_gesture = "none"
                    tr.last_yawning = False
                    tr.last_yawn_reason = None
                    tr.on_phone = any(phone_near_face(pb, tr.box) for pb in last_phone_boxes)
                    tr.last_score = engagement_score(tr.last_emotion, tr.last_state, tr.last_gesture)
                    _persist_track(tr, subtitle_text=latest_subtitle, face_count=len(tracks))

            # ---- Heavy path: identify + emotion + phone + save_observation ----
            if frame_idx % process_every_n == 0:
                if mp_face_mesh is not None and mp_hands is not None:
                    phones = detect_phones(frame)
                    last_phone_boxes = [p["box"] for p in phones]

                    # Re-identify enrolled students every N frames and attach
                    # the matched student_id to whichever track owns that face
                    # box (matched by IoU). Without this step every track stays
                    # at the default "unknown".
                    if enrolled:
                        try:
                            id_dets = face_id.detect_and_identify(
                                rgb, enrolled, tolerance=tolerance,
                            )
                        except Exception as e:
                            id_dets = []
                            _log(f"face identify failed: {e}")

                        named_count = 0
                        unmatched_to_track = 0
                        for det in id_dets:
                            sid = det.get("student_id")
                            box = det.get("box")
                            dist = det.get("distance")
                            if not sid or sid == "unknown":
                                _log(
                                    f"id: face at {box} -> unknown"
                                    + (f" (closest dist={dist:.3f})" if dist is not None else "")
                                )
                                continue
                            best_tid, best_iou = None, _MIN_IOU_ID_MATCH
                            for tid, tr in tracks.items():
                                iou = _iou(box, tr.box)
                                if iou > best_iou:
                                    best_iou = iou
                                    best_tid = tid
                            if best_tid is not None:
                                tracks[best_tid].student_id = sid
                                tracks[best_tid].name = names.get(sid, sid)
                                named_count += 1
                            else:
                                unmatched_to_track += 1
                        _log(
                            f"id pass: {len(id_dets)} face(s) detected, "
                            f"{named_count} matched to tracks, "
                            f"{unmatched_to_track} identified but no track IoU match"
                        )
                    else:
                        _log("id pass: skipped — no enrolled encodings loaded for this lecture")

                    for tid, tr in tracks.items():
                        top, right, bottom, left = tr.box
                        face_rect = (left, top, right - left, bottom - top)
                        emo = emotion_mod.detect_emotion(frame, face_rect=face_rect)
                        tr.last_emotion = emo["emotion"]
                        tr.last_conf = emo["confidence"]
                        tr.on_phone = any(phone_near_face(pb, tr.box) for pb in last_phone_boxes)
                        tr.last_score = engagement_score(
                            tr.last_emotion, tr.last_state, tr.last_gesture,
                        )
                        _persist_track(tr, subtitle_text=latest_subtitle, face_count=len(tracks))

            # ---- Draw everything ----
            for tid, tr in tracks.items():
                if tr.last_state == "sleeping":
                    color = (0, 0, 255)
                elif tr.last_yawning:
                    color = (0, 165, 255)  # amber
                elif tr.last_gesture == "hand_raised":
                    color = (255, 0, 0)
                else:
                    color = (0, 200, 0)
                state_line = f"state: {tr.last_state}"
                if tr.last_state == "sleeping" and tr.last_reason:
                    state_line += f" ({tr.last_reason})"
                lines = [
                    f"student: {tr.name} ({tr.student_id})",
                    f"emotion: {tr.last_emotion} ({tr.last_conf:.2f})",
                    state_line,
                    f"gesture: {tr.last_gesture}",
                    f"score: {tr.last_score:.2f}",
                    f"attention: {tr.last_attention:.1f}{' !!' if tr.last_attention_warning else ''}",
                ]
                if tr.last_yawning:
                    tag = "yawning"
                    if tr.last_yawn_reason == "hand_covered":
                        tag = "yawning (hand)"
                    elif tr.last_yawn_reason == "both":
                        tag = "yawning (hand+mouth)"
                    elif tr.last_yawn_reason == "mouth_open":
                        tag = "yawning (mouth)"
                    lines.insert(0, tag)
                if tr.on_phone:
                    lines.insert(0, "!! ON PHONE !!")
                if tr.last_cheat_warning:
                    lines.insert(0, f"!! CHEAT RISK {tr.last_cheat_score:.1f} !!")
                _draw_stack(frame, tr.box, lines, color)

            for (x1, y1, x2, y2) in last_phone_boxes:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
                cv2.putText(frame, "phone", (x1, max(15, y1 - 5)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)

            _draw_subtitle(frame, latest_subtitle)

            now = time.time()
            if now - last_flush >= save_interval:
                flushed = firebase_writer.flush_buffer()
                total_rows += flushed
                last_flush = now

            # Write recommendations every 60 seconds per identified student
            if now - last_rec_flush >= 60.0:
                last_rec_flush = now
                att_rate = len(_marked_present) / max(1, len(_marked_present) + 1)
                for tid, tr in tracks.items():
                    if tr.student_id == "unknown":
                        continue
                    try:
                        items = recommendation_text(
                            attention=tr.last_attention,
                            attendance_rate=att_rate,
                        )
                        firebase_writer.write_recommendation(
                            tr.student_id, lecture_id, items,
                            tr.last_attention, att_rate,
                        )
                    except Exception as e:
                        _log(f"recommendation write failed: {e}")

            if on_frame is not None:
                on_frame(frame)
            else:
                cv2.imshow("Classroom Capture", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
            frame_idx += 1

    finally:
        # Finalize sequence — best-effort; log but never crash.
        try:
            flushed = firebase_writer.flush_buffer()
            total_rows += flushed
        except Exception as e:
            _log(f"final flush failed: {e}")

        try:
            cap.release()
            if on_frame is None:
                cv2.destroyAllWindows()
            if mp_face_mesh is not None:
                mp_face_mesh.close()
            if mp_hands is not None:
                mp_hands.close()
        except Exception:
            pass

        wav_path = None
        try:
            transcriber.stop()
        except Exception as e:
            _log(f"transcriber.stop failed: {e}")
        try:
            wav_path = recorder.stop()
        except Exception as e:
            _log(f"recorder.stop failed: {e}")

        if wav_path is not None:
            try:
                firebase_writer.upload_audio(lecture_id, str(wav_path))
            except Exception as e:
                _log(f"upload_audio failed: {e}")

        plumber_url = os.getenv("PLUMBER_URL", "http://localhost:8000")
        finalize_secret = os.getenv("FINALIZE_SHARED_SECRET", "")
        try:
            r = requests.post(
                f"{plumber_url}/api/lectures/{lecture_id}/finalize",
                headers={"X-Finalize-Secret": finalize_secret},
                timeout=10,
            )
            _log(f"finalize: {r.status_code} {r.text[:200]}")
        except Exception as e:
            _log(f"finalize call failed: {e}")

        _log(f"Captured {total_rows} observations; audio: {wav_path}; transcript was streamed live.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
