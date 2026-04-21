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
import logging, warnings
logging.getLogger("tensorflow").setLevel(logging.ERROR)
logging.getLogger("absl").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning, module="google.*")

import sys
import time
from typing import Dict, List, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np
import requests
from dotenv import load_dotenv
from google.cloud.firestore_v1.base_query import FieldFilter

import firebase_writer
import face_id
import emotion as emotion_mod
from engagement import engagement_score
from sleep_detector import SleepHistory, classify_sleep
from gesture_detector import (
    GestureHistory,
    assign_hand_to_face,
    classify_gesture,
    init_hands,
)
from audio_recorder import AudioRecorder
from stream_transcribe import StreamTranscriber
from phone_detector import detect_phones, hand_on_phone, phone_near_face


_LINE_H = 18
_BOX_EMA_ALPHA = 0.45      # box smoothing: lower = smoother/laggier
_MIN_IOU_MATCH = 0.3       # mesh face to track association
_MIN_IOU_ID_MATCH = 0.2    # face_recognition box to track association (looser)
_MAX_MISSED_FRAMES = 15    # drop a track after this many frames with no mesh match


def _pick_lecture(db) -> Tuple[str, dict]:
    lectures = list(
        db.collection("lectures")
        .where(filter=FieldFilter("status", "in", ["scheduled", "recording"]))
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
    max_w = max((cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0][0]
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
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)


class FaceTrack:
    __slots__ = (
        "track_id", "box", "student_id",
        "sleep_hist", "gesture_hist",
        "last_emotion", "last_conf",
        "last_state", "last_reason", "last_gesture", "last_score",
        "on_phone", "missed_frames",
    )

    def __init__(self, track_id: int, box):
        self.track_id = track_id
        self.box = box
        self.student_id = "unknown"
        self.sleep_hist = SleepHistory()
        self.gesture_hist = GestureHistory()
        self.last_emotion = "neutral"
        self.last_conf = 0.0
        self.last_state = "awake"
        self.last_reason: Optional[str] = None
        self.last_gesture = "none"
        self.last_score = 0.0
        self.on_phone = False
        self.missed_frames = 0


def main() -> int:
    load_dotenv()
    db = firebase_writer.init_firebase()

    lecture_id, lecture_doc = _pick_lecture(db)
    print(f"\nRecording lecture: {lecture_id} — {lecture_doc.get('title')}")
    firebase_writer.set_lecture_status(lecture_id, "recording")

    enrolled = face_id.load_enrolled_encodings(db, lecture_id)
    print(f"Loaded {len(enrolled)} enrolled face encoding(s).")

    mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=8,
        refine_landmarks=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    mp_hands = init_hands(max_num_hands=8)

    recorder = AudioRecorder()
    transcriber = StreamTranscriber()
    try:
        recorder.start(lecture_id)
        recorder.add_listener(transcriber.feed)
        transcriber.start(lecture_id)
    except Exception as e:
        print(f"Audio/transcription init failed ({e}); continuing video-only.")

    camera_index = int(os.getenv("CAMERA_INDEX", "0"))
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print(f"Could not open camera at index {camera_index}")
        return 3

    process_every_n = int(os.getenv("PROCESS_EVERY_N_FRAMES", "30"))
    save_interval = float(os.getenv("SAVE_INTERVAL_SECONDS", "3"))
    tolerance = float(os.getenv("FACE_MATCH_TOLERANCE", "0.6"))

    tracks: Dict[int, FaceTrack] = {}
    next_track_id = 0
    last_phone_boxes: List[Tuple[int, int, int, int]] = []

    frame_idx = 0
    last_flush = time.time()
    total_rows = 0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Frame read failed; stopping.")
                break
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

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

            # EMA-smooth per-track box + run sleep on every matched track.
            for mi, tid in matched.items():
                tr = tracks[tid]
                tr.box = _ema_box(raw_boxes[mi], tr.box)
                lm = mesh_faces[mi].landmark
                state, reason = classify_sleep(lm, (w, h), tr.sleep_hist)
                tr.last_state = state
                tr.last_reason = reason

            # Hand attribution (every frame) + gesture classification.
            face_centers: List[Tuple[float, float]] = []
            tids_in_order: List[int] = []
            for mi, tid in matched.items():
                t, r, b, l = tracks[tid].box
                face_centers.append(((l + r) / 2.0, (t + b) / 2.0))
                tids_in_order.append(tid)

            # Filter out hands occupied by a phone — a hand holding a phone
            # can't simultaneously hand_raise / thumbs_up / etc.
            free_hands: List = []
            free_hand_centers: List[Tuple[float, float]] = []
            if hand_res.multi_hand_landmarks:
                for hl in hand_res.multi_hand_landmarks:
                    if hand_on_phone(hl, last_phone_boxes, w, h):
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

            # ---- Heavy path: identify + emotion + phone + save_observation ----
            if frame_idx % process_every_n == 0:
                detections = face_id.detect_and_identify(rgb, enrolled, tolerance=tolerance)
                for det in detections:
                    best_tid, best_iou = None, _MIN_IOU_ID_MATCH
                    for tid, tr in tracks.items():
                        iou = _iou(det["box"], tr.box)
                        if iou > best_iou:
                            best_iou = iou
                            best_tid = tid
                    if best_tid is not None:
                        tracks[best_tid].student_id = det["student_id"]

                phones = detect_phones(frame)
                last_phone_boxes = [p["box"] for p in phones]

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
                    # Skip persisting observations for unidentified tracks —
                    # otherwise the emotions collection floods with "unknown"
                    # rows while enrollments are being set up.
                    if tr.student_id != "unknown":
                        firebase_writer.save_observation(
                            student_id=tr.student_id,
                            lecture_id=lecture_id,
                            emotion=tr.last_emotion,
                            confidence=tr.last_conf,
                            state=tr.last_state,
                            sleep_reason=tr.last_reason,
                            gesture=tr.last_gesture,
                            engagement_score=tr.last_score,
                        )

            # ---- Draw everything ----
            for tid, tr in tracks.items():
                if tr.last_state == "sleeping":
                    color = (0, 0, 255)
                elif tr.last_gesture == "hand_raised":
                    color = (255, 0, 0)
                else:
                    color = (0, 200, 0)
                state_line = f"state: {tr.last_state}"
                if tr.last_state == "sleeping" and tr.last_reason:
                    state_line += f" ({tr.last_reason})"
                lines = [
                    f"student: {tr.student_id}",
                    f"emotion: {tr.last_emotion} ({tr.last_conf:.2f})",
                    state_line,
                    f"gesture: {tr.last_gesture}",
                    f"score: {tr.last_score:.2f}",
                ]
                if tr.on_phone:
                    lines.insert(0, "!! ON PHONE !!")
                _draw_stack(frame, tr.box, lines, color)

            for (x1, y1, x2, y2) in last_phone_boxes:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
                cv2.putText(frame, "phone", (x1, max(15, y1 - 5)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)

            now = time.time()
            if now - last_flush >= save_interval:
                flushed = firebase_writer.flush_buffer()
                total_rows += flushed
                last_flush = now

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
            print(f"final flush failed: {e}")

        try:
            cap.release()
            cv2.destroyAllWindows()
            mp_face_mesh.close()
            mp_hands.close()
        except Exception:
            pass

        wav_path = None
        try:
            transcriber.stop()
        except Exception as e:
            print(f"transcriber.stop failed: {e}")
        try:
            wav_path = recorder.stop()
        except Exception as e:
            print(f"recorder.stop failed: {e}")

        if wav_path is not None:
            try:
                firebase_writer.upload_audio(lecture_id, str(wav_path))
            except Exception as e:
                print(f"upload_audio failed: {e}")

        plumber_url = os.getenv("PLUMBER_URL", "http://localhost:8000")
        finalize_secret = os.getenv("FINALIZE_SHARED_SECRET", "")
        try:
            r = requests.post(
                f"{plumber_url}/api/lectures/{lecture_id}/finalize",
                headers={"X-Finalize-Secret": finalize_secret},
                timeout=10,
            )
            print(f"finalize: {r.status_code} {r.text[:200]}")
        except Exception as e:
            print(f"finalize call failed: {e}")

        print(f"\nCaptured {total_rows} observations; audio: {wav_path}; transcript was streamed live.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
