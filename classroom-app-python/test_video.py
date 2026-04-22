"""Standalone video pipeline smoke test — no Firebase required.

Single-face pipeline so sleep + gesture classification can run on every frame
(not only on the heavy path). That gives responsive detection at ~30 Hz for
demoing — sub-second reaction to closed eyes, head tilt, and hand gestures.

Pipeline cadence:
    every frame  -> MediaPipe Face Mesh + Hands, sleep_detector, gesture_detector
    every N      -> face_recognition identify (not used here), FER emotion

Debug output to stdout shows live EAR, pitch, and raw/stable gestures so you
can tune thresholds in .env.

Quit with 'q'.
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

import time

import cv2
import mediapipe as mp
import numpy as np
from dotenv import load_dotenv

import face_recognition
from emotion import detect_emotion
from engagement import engagement_score
from sleep_detector import (
    EAR_CLOSED_THRESHOLD,
    HEAD_DOWN_PITCH_DEG,
    SleepHistory,
    _compute_ear,
    _compute_pitch,
    classify_sleep,
)
from gesture_detector import (
    GestureHistory,
    classify_gesture,
    gesture_diagnostic,
    init_hands,
)
from phone_detector import detect_phones, hand_on_phone, phone_near_face


_LINE_H = 18
_BOX_EMA_ALPHA = 0.45  # lower = smoother but laggier; 0.45 balances well


def _bbox_from_landmarks(landmarks, w: int, h: int):
    xs = [lm.x * w for lm in landmarks]
    ys = [lm.y * h for lm in landmarks]
    return (int(min(ys)), int(max(xs)), int(max(ys)), int(min(xs)))  # top, right, bottom, left


def _ema_box(new_box, prev_box, alpha: float = _BOX_EMA_ALPHA):
    if prev_box is None:
        return new_box
    return tuple(int(alpha * n + (1 - alpha) * p)
                 for n, p in zip(new_box, prev_box))


def _draw_stack(frame, top_left, lines, color):
    """Draw a vertical list of labels above the given top_left (x, y)."""
    x, y = top_left
    frame_h = frame.shape[0]
    total_h = _LINE_H * len(lines)
    start_y = y - 8 - total_h
    # Fall back to below the box if there isn't enough space above.
    if start_y < 15:
        start_y = y + _LINE_H + 5
    # Background strip for readability against any video.
    max_w = max((cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0][0]
                 for line in lines), default=0)
    cv2.rectangle(frame, (x - 2, start_y - _LINE_H),
                  (x + max_w + 6, start_y - _LINE_H + total_h + 4),
                  (0, 0, 0), cv2.FILLED)
    for i, line in enumerate(lines):
        yy = start_y + i * _LINE_H
        if yy >= frame_h:
            break
        cv2.putText(frame, line, (x + 2, yy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)


def main():
    load_dotenv()

    camera_index = int(os.getenv("CAMERA_INDEX", "0"))
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print(f"Could not open camera at index {camera_index}. "
              f"Try setting CAMERA_INDEX=1 in .env.")
        return 1

    mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False, max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.5, min_tracking_confidence=0.5,
    )
    mp_hands = init_hands(max_num_hands=2)

    process_every_n = int(os.getenv("PROCESS_EVERY_N_FRAMES", "30"))
    sleep_hist = SleepHistory()
    gesture_hist = GestureHistory()

    last_emotion = "neutral"
    last_conf = 0.0
    last_box = None
    last_phone_boxes = []
    last_on_phone = False
    frame_idx = 0
    last_log_t = 0.0

    print("Webcam open. Close eyes, tilt head down, raise hand, thumbs-up/down to test.")
    print(f"Thresholds: EAR<{EAR_CLOSED_THRESHOLD}, pitch<{HEAD_DOWN_PITCH_DEG}° for 'head down'")
    print("Live debug: emotion=... conf=... EAR=... pitch=... state=... gesture=... score=...")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("frame read failed")
                break
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            mesh_res = mp_face_mesh.process(rgb)
            hand_res = mp_hands.process(rgb)

            # Every frame: smooth face box from MediaPipe landmarks (much
            # steadier than face_recognition's once-per-second rectangle).
            if mesh_res.multi_face_landmarks:
                raw_box = _bbox_from_landmarks(
                    mesh_res.multi_face_landmarks[0].landmark, w, h,
                )
                last_box = _ema_box(raw_box, last_box)

            # Heavy path: only emotion CNN + phone YOLO periodically.
            if frame_idx % process_every_n == 0:
                if last_box is not None:
                    top, right, bottom, left = last_box
                    face_rect = (left, top, right - left, bottom - top)
                    emo = detect_emotion(frame, face_rect=face_rect)
                    last_emotion = emo["emotion"]
                    last_conf = emo["confidence"]

                phones = detect_phones(frame)
                last_phone_boxes = [p["box"] for p in phones]
                last_on_phone = False
                if last_box is not None:
                    last_on_phone = any(
                        phone_near_face(pb, last_box) for pb in last_phone_boxes
                    )

            # Every frame: sleep + gesture off MediaPipe Face Mesh + Hands.
            state, sleep_reason = "awake", None
            ear_val = None
            pitch_val = None
            if mesh_res.multi_face_landmarks:
                lm = mesh_res.multi_face_landmarks[0].landmark
                ear_val = _compute_ear(lm)
                pitch_val = _compute_pitch(lm, (w, h))
                state, sleep_reason = classify_sleep(lm, (w, h), sleep_hist)

            raw_gesture = "none"
            face_center = None
            gesture_dbg = None
            if last_box is not None:
                top, right, bottom, left = last_box
                face_center = ((left + right) / 2, (top + bottom) / 2)
            if hand_res.multi_hand_landmarks and face_center is not None:
                # Skip any hand that's holding a phone — it can't simultaneously
                # hand_raise / thumbs / etc.
                best_hand, best_d = None, float("inf")
                for hl in hand_res.multi_hand_landmarks:
                    if hand_on_phone(hl, last_phone_boxes, w, h):
                        continue
                    hc = (hl.landmark[0].x * w, hl.landmark[0].y * h)
                    d = ((hc[0] - face_center[0]) ** 2 + (hc[1] - face_center[1]) ** 2) ** 0.5
                    if d < best_d:
                        best_d, best_hand = d, hl
                if best_hand is not None:
                    raw_gesture = classify_gesture(best_hand, face_ref=face_center)
                    gesture_dbg = gesture_diagnostic(best_hand)
            stable_gesture = gesture_hist.push(raw_gesture)

            score = engagement_score(last_emotion, state, stable_gesture)

            # Live debug every 0.5 sec.
            now = time.time()
            if now - last_log_t > 0.5:
                ear_s = f"{ear_val:.3f}" if ear_val is not None else "--"
                smooth_s = (f"{sleep_hist.smooth_ear:.3f}"
                            if sleep_hist.smooth_ear is not None else "--")
                pitch_s = f"{pitch_val:+.1f}°" if pitch_val is not None else "--"
                streak = sleep_hist.closed_streak
                print(f"emotion={last_emotion:8s}  conf={last_conf:.2f}  "
                      f"EAR={ear_s}/smooth={smooth_s}  streak={streak}  "
                      f"pitch={pitch_s}  state={state}({sleep_reason})  "
                      f"raw={raw_gesture:14s}  stable={stable_gesture:14s}  score={score:.2f}")
                if gesture_dbg is not None:
                    # Curl angles: < 0.6 = extended; > 1.6 = curled.
                    # toilet_request = idx extended + mid curled + ring curled + pinky extended.
                    print(f"  hand curls: idx={gesture_dbg['index_curl']}  "
                          f"mid={gesture_dbg['middle_curl']}  "
                          f"ring={gesture_dbg['ring_curl']}  "
                          f"pinky={gesture_dbg['pinky_curl']}")
                last_log_t = now

            # Draw — stack all info above the box, one line per attribute.
            if last_box is not None:
                top, right, bottom, left = last_box
                color = (0, 0, 255) if state == "sleeping" else (
                        (255, 0, 0) if stable_gesture == "hand_raised" else (0, 200, 0))
                cv2.rectangle(frame, (left, top), (right, bottom), color, 2)

                state_line = f"state: {state}"
                if state == "sleeping" and sleep_reason:
                    state_line += f" ({sleep_reason})"
                lines = [
                    f"emotion: {last_emotion} ({last_conf:.2f})",
                    state_line,
                    f"gesture: {stable_gesture}",
                    f"score: {score:.2f}",
                ]
                if last_on_phone:
                    lines.insert(0, "!! ON PHONE !!")
                _draw_stack(frame, (left, top), lines, color)

            # Draw every detected phone box too (yellow).
            for (x1, y1, x2, y2) in last_phone_boxes:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
                cv2.putText(frame, "phone", (x1, max(15, y1 - 5)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)

            # Also draw hand skeleton when any gesture is detected, helpful for tuning.
            if hand_res.multi_hand_landmarks:
                for hl in hand_res.multi_hand_landmarks:
                    mp.solutions.drawing_utils.draw_landmarks(
                        frame, hl, mp.solutions.hands.HAND_CONNECTIONS,
                    )

            cv2.imshow("Video pipeline smoke test (no Firebase) — q to quit", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
            frame_idx += 1
    finally:
        cap.release()
        cv2.destroyAllWindows()
        mp_face_mesh.close()
        mp_hands.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
