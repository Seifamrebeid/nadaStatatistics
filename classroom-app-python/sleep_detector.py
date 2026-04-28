"""Sleep detection via MediaPipe Face Mesh (478 landmarks per face).

Two independent signals drive awake/sleeping:

1. Eye Aspect Ratio (EAR) — eyes closed for >= EAR_CLOSED_FRAMES consecutive frames.
2. Head pose pitch — pitch below HEAD_DOWN_PITCH_DEG for >= HEAD_DOWN_FRAMES
   consecutive frames.

Both signals are smoothed over a per-face ring buffer. Without smoothing every
blink flips to "sleeping" and every glance at notes flips to "looking down".

Thresholds come from environment variables (see `.env.example`). The public
`eyes_closed` / `head_down` helpers return the instantaneous per-frame booleans;
`classify_sleep` applies temporal smoothing through a `SleepHistory` buffer.
"""

import math
import os
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Optional, Tuple
from urllib.request import urlretrieve

import cv2
import mediapipe as mp
import numpy as np


EAR_CLOSED_THRESHOLD = float(os.getenv("EAR_CLOSED_THRESHOLD", "0.20"))
EAR_CLOSED_FRAMES = int(os.getenv("EAR_CLOSED_FRAMES", "15"))
HEAD_DOWN_PITCH_DEG = float(os.getenv("HEAD_DOWN_PITCH_DEG", "-20"))
HEAD_DOWN_FRAMES = int(os.getenv("HEAD_DOWN_FRAMES", "15"))
_FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)


def _ensure_face_model() -> Path:
    model_dir = Path(__file__).with_name("models")
    model_dir.mkdir(parents=True, exist_ok=True)
    model_path = model_dir / "face_landmarker.task"
    if not model_path.exists():
        urlretrieve(_FACE_MODEL_URL, model_path)
    return model_path


class _TaskFaceWrapper:
    def __init__(self, landmarker):
        self._landmarker = landmarker
        self._last_ts = 0

    def process(self, rgb):
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        ts = max(int(time.time() * 1000), self._last_ts + 1)
        self._last_ts = ts
        result = self._landmarker.detect_for_video(image, ts)
        faces = [SimpleNamespace(landmark=list(landmark)) for landmark in (result.face_landmarks or [])]
        return SimpleNamespace(multi_face_landmarks=faces)

    def close(self):
        self._landmarker.close()


def init_face_mesh(max_num_faces: int = 8):
    if getattr(mp, "solutions", None):
        return mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=max_num_faces,
            refine_landmarks=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    from mediapipe.tasks.python.core.base_options import BaseOptions
    from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode
    from mediapipe.tasks.python.vision.face_landmarker import FaceLandmarker, FaceLandmarkerOptions

    model_path = _ensure_face_model()
    options = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path)),
        running_mode=VisionTaskRunningMode.VIDEO,
        num_faces=max_num_faces,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return _TaskFaceWrapper(FaceLandmarker.create_from_options(options))

# MediaPipe Face Mesh eye landmark indices (standard 6-point EAR set).
_LEFT_EYE = (33, 160, 158, 133, 153, 144)
_RIGHT_EYE = (263, 387, 385, 362, 380, 373)

# Canonical 3D face model (mm) for solvePnP — 6 reference points.
_MODEL_POINTS = np.array([
    (0.0,    0.0,    0.0),      # nose tip (idx 1)
    (0.0,   -330.0, -65.0),     # chin     (idx 152)
    (-225.0, 170.0, -135.0),    # left eye outer corner  (idx 33)
    (225.0,  170.0, -135.0),    # right eye outer corner (idx 263)
    (-150.0, -150.0, -125.0),   # left mouth corner  (idx 61)
    (150.0,  -150.0, -125.0),   # right mouth corner (idx 291)
], dtype=np.float64)
_MODEL_LANDMARK_IDS = (1, 152, 33, 263, 61, 291)


def _compute_ear(landmarks) -> float:
    def eye_ear(idxs):
        pts = [(landmarks[i].x, landmarks[i].y) for i in idxs]
        d15 = math.hypot(pts[1][0] - pts[5][0], pts[1][1] - pts[5][1])
        d24 = math.hypot(pts[2][0] - pts[4][0], pts[2][1] - pts[4][1])
        d03 = math.hypot(pts[0][0] - pts[3][0], pts[0][1] - pts[3][1])
        return (d15 + d24) / (2.0 * d03) if d03 > 0 else 0.0
    return (eye_ear(_LEFT_EYE) + eye_ear(_RIGHT_EYE)) / 2.0


def _compute_pitch(landmarks, image_size: Tuple[int, int]) -> Optional[float]:
    w, h = image_size
    image_points = np.array(
        [(landmarks[i].x * w, landmarks[i].y * h) for i in _MODEL_LANDMARK_IDS],
        dtype=np.float64,
    )
    focal = float(w)
    cam_matrix = np.array([
        [focal, 0,     w / 2],
        [0,     focal, h / 2],
        [0,     0,     1],
    ], dtype=np.float64)
    dist = np.zeros((4, 1))
    ok, rvec, _ = cv2.solvePnP(_MODEL_POINTS, image_points, cam_matrix, dist,
                               flags=cv2.SOLVEPNP_ITERATIVE)
    if not ok:
        return None
    rmat, _ = cv2.Rodrigues(rvec)
    sy = math.sqrt(rmat[0, 0] ** 2 + rmat[1, 0] ** 2)
    # Negative pitch = chin tucked toward chest
    return math.degrees(math.atan2(-rmat[2, 0], sy))


def eyes_closed(landmarks) -> bool:
    """Instantaneous per-frame check. Smoothing is in `classify_sleep`."""
    return _compute_ear(landmarks) < EAR_CLOSED_THRESHOLD


def head_down(landmarks, image_size: Tuple[int, int]) -> bool:
    """Instantaneous per-frame check. Smoothing is in `classify_sleep`."""
    pitch = _compute_pitch(landmarks, image_size)
    return pitch is not None and pitch < HEAD_DOWN_PITCH_DEG


class SleepHistory:
    """Per-face EMA smoothing + consecutive-frame streak counter.

    Raw EAR/pitch from MediaPipe jitters by a few percent frame-to-frame, which
    breaks a strict `all-last-N-below-threshold` rule: one spike resets the
    counter and you lose intermittent detections. Instead we smooth the signal
    with an EMA and then count consecutive frames of the *smoothed* value
    below threshold — single-frame spikes get washed out.

    Tuning:
      alpha=0.35  — responsive enough to flip within ~3 frames of genuine change
                    but heavy enough to swallow one-frame landmark jitter.
    """

    def __init__(self, alpha: float = 0.35):
        self.alpha = alpha
        self.smooth_ear: Optional[float] = None
        self.smooth_pitch: Optional[float] = None
        self.closed_streak = 0
        self.down_streak = 0

    def push(self, ear_val: float, pitch_val: Optional[float]) -> None:
        self.smooth_ear = (
            ear_val if self.smooth_ear is None
            else self.alpha * ear_val + (1 - self.alpha) * self.smooth_ear
        )
        p = pitch_val if pitch_val is not None else 0.0
        self.smooth_pitch = (
            p if self.smooth_pitch is None
            else self.alpha * p + (1 - self.alpha) * self.smooth_pitch
        )

        self.closed_streak = (self.closed_streak + 1
                              if self.smooth_ear < EAR_CLOSED_THRESHOLD else 0)
        self.down_streak = (self.down_streak + 1
                            if self.smooth_pitch < HEAD_DOWN_PITCH_DEG else 0)

    def is_eyes_closed(self) -> bool:
        return self.closed_streak >= EAR_CLOSED_FRAMES

    def is_head_down(self) -> bool:
        return self.down_streak >= HEAD_DOWN_FRAMES


def classify_sleep(face_landmarks, image_size: Tuple[int, int],
                   history: SleepHistory) -> Tuple[str, Optional[str]]:
    """Push this frame's EAR + pitch, then classify sleep state.

    Returns (state, sleep_reason) — state is "awake" or "sleeping",
    sleep_reason is None | "eyes_closed" | "head_down" | "both".
    """
    ear_val = _compute_ear(face_landmarks)
    pitch_val = _compute_pitch(face_landmarks, image_size)
    history.push(ear_val, pitch_val)

    ec = history.is_eyes_closed()
    hd = history.is_head_down()
    if ec and hd:
        return "sleeping", "both"
    if ec:
        return "sleeping", "eyes_closed"
    if hd:
        return "sleeping", "head_down"
    return "awake", None
