"""Yawn detection via MediaPipe Face Mesh mouth landmarks + hand-over-mouth.

Two independent signals drive the yawning flag:

1. Mouth Aspect Ratio (MAR) — vertical inner-lip gap over mouth width. Sustained
   above MAR_OPEN_THRESHOLD for >= MAR_OPEN_FRAMES consecutive frames.
2. Hand covering the mouth — a polite yawn. Any detected hand's bbox overlaps
   the mouth region for >= HAND_ON_MOUTH_FRAMES consecutive frames.

Either signal trips the state to "yawning". Both are smoothed through a per-face
`YawnHistory` buffer (mirrors the SleepHistory pattern in sleep_detector.py).

The caller (capture_app) is also expected to use `mouth_bbox` + `hand_over_mouth`
to exclude hands-on-mouth from gesture classification — a hand covering the
mouth cannot simultaneously thumbs_up / hand_raise / etc.
"""

import math
import os
from typing import List, Optional, Tuple


MAR_OPEN_THRESHOLD = float(os.getenv("MAR_OPEN_THRESHOLD", "0.50"))
MAR_OPEN_FRAMES = int(os.getenv("MAR_OPEN_FRAMES", "10"))
HAND_ON_MOUTH_FRAMES = int(os.getenv("HAND_ON_MOUTH_FRAMES", "12"))

# MediaPipe Face Mesh mouth landmark indices.
_UPPER_INNER = 13    # upper lip, inner center (lower edge)
_LOWER_INNER = 14    # lower lip, inner center (upper edge)
_LEFT_CORNER = 61    # outer left mouth corner
_RIGHT_CORNER = 291  # outer right mouth corner

# Extra perimeter points for the padded mouth bbox used by hand-over-mouth.
_MOUTH_PERIMETER = (0, 17, 61, 291, 37, 267, 84, 314, 13, 14)


def mouth_aspect_ratio(landmarks) -> float:
    """Vertical inner-lip gap divided by outer mouth width. 0 = sealed, ~0.6+ = wide yawn."""
    up = landmarks[_UPPER_INNER]
    lo = landmarks[_LOWER_INNER]
    lt = landmarks[_LEFT_CORNER]
    rt = landmarks[_RIGHT_CORNER]
    vertical = math.hypot(up.x - lo.x, up.y - lo.y)
    horizontal = math.hypot(lt.x - rt.x, lt.y - rt.y)
    return vertical / horizontal if horizontal > 1e-6 else 0.0


def mouth_bbox(landmarks, w: int, h: int) -> Tuple[int, int, int, int]:
    """Padded mouth bounding box in pixel coords: (x1, y1, x2, y2).

    Padded so a hand hovering just above/below the lips still registers as
    covering the mouth. Too tight and we miss polite yawn coverage; too loose
    and any hand near the chin triggers it — 30%/50% pad is the sweet spot.
    """
    xs = [landmarks[i].x * w for i in _MOUTH_PERIMETER]
    ys = [landmarks[i].y * h for i in _MOUTH_PERIMETER]
    x1, x2 = min(xs), max(xs)
    y1, y2 = min(ys), max(ys)
    pad_x = (x2 - x1) * 0.30
    pad_y = (y2 - y1) * 0.50
    return (int(x1 - pad_x), int(y1 - pad_y), int(x2 + pad_x), int(y2 + pad_y))


def hand_over_mouth(hand_landmarks, mouth_box: Tuple[int, int, int, int],
                    w: int, h: int, min_overlap: float = 0.15) -> bool:
    """True when the hand's 2D bbox overlaps the padded mouth bbox by at least
    `min_overlap` of the mouth area. Symmetric to `phone_detector.hand_on_phone`
    but anchored to the mouth region instead of a phone detection."""
    mx1, my1, mx2, my2 = mouth_box
    xs = [lm.x * w for lm in hand_landmarks.landmark]
    ys = [lm.y * h for lm in hand_landmarks.landmark]
    hx1, hx2 = min(xs), max(xs)
    hy1, hy2 = min(ys), max(ys)
    ix1 = max(hx1, mx1)
    iy1 = max(hy1, my1)
    ix2 = min(hx2, mx2)
    iy2 = min(hy2, my2)
    if ix2 <= ix1 or iy2 <= iy1:
        return False
    mouth_area = max(1.0, (mx2 - mx1) * (my2 - my1))
    inter = (ix2 - ix1) * (iy2 - iy1)
    return inter / mouth_area >= min_overlap


class YawnHistory:
    """Per-face EMA smoothing + consecutive-frame streak counter.

    MAR jitters frame-to-frame, same as EAR, so a strict `all-last-N-above-threshold`
    rule loses sustained yawns to single-frame dips. EMA + streak on the smoothed
    signal matches how SleepHistory handles eye closure.
    """

    def __init__(self, alpha: float = 0.40):
        self.alpha = alpha
        self.smooth_mar: Optional[float] = None
        self.open_streak = 0
        self.covered_streak = 0

    def push(self, mar: float, hand_covered: bool) -> None:
        self.smooth_mar = (
            mar if self.smooth_mar is None
            else self.alpha * mar + (1 - self.alpha) * self.smooth_mar
        )
        self.open_streak = (self.open_streak + 1
                            if self.smooth_mar >= MAR_OPEN_THRESHOLD else 0)
        self.covered_streak = self.covered_streak + 1 if hand_covered else 0

    def classify(self) -> Tuple[bool, Optional[str]]:
        """Returns (yawning, reason). reason in {None, "mouth_open", "hand_covered", "both"}."""
        open_hit = self.open_streak >= MAR_OPEN_FRAMES
        covered_hit = self.covered_streak >= HAND_ON_MOUTH_FRAMES
        if open_hit and covered_hit:
            return True, "both"
        if open_hit:
            return True, "mouth_open"
        if covered_hit:
            return True, "hand_covered"
        return False, None


def classify_yawn(face_landmarks, image_size: Tuple[int, int],
                  hand_landmarks_list: List, history: YawnHistory,
                  ) -> Tuple[bool, Optional[str], Tuple[int, int, int, int]]:
    """Push this frame's MAR + hand-coverage, classify, and return the mouth box.

    The mouth box is returned so the caller can reuse it for gesture-hand
    filtering without recomputing it per face.
    """
    w, h = image_size
    mar = mouth_aspect_ratio(face_landmarks)
    mbox = mouth_bbox(face_landmarks, w, h)
    covered = False
    if hand_landmarks_list:
        for hl in hand_landmarks_list:
            if hand_over_mouth(hl, mbox, w, h):
                covered = True
                break
    history.push(mar, covered)
    yawning, reason = history.classify()
    return yawning, reason, mbox
