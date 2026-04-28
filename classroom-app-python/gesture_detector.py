"""Hand-gesture detection via MediaPipe Hands (21 landmarks per hand).

Built-in gestures + extensible registry. To add a new gesture, append one
entry to GESTURE_REGISTRY — do not fork this module.

Registry order matters: the first matching detector wins. `toilet_request`
sits first because its ASL T-handshape is close to a clenched fist and would
otherwise shadow easier detectors.

Temporal stability: `classify_gesture` returns the instantaneous per-frame
guess. Wrap it with `GestureHistory.push(g)` to enforce
`GESTURE_HOLD_FRAMES` consecutive matches before reporting — otherwise hands
moving through transient poses trigger false positives.
"""

import math
import os
import time
from collections import deque
from pathlib import Path
from types import SimpleNamespace
from typing import Callable, Dict, List, Optional, Tuple
from urllib.request import urlretrieve

import mediapipe as mp


GESTURE_HOLD_FRAMES = int(os.getenv("GESTURE_HOLD_FRAMES", "8"))
_HAND_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)


def _ensure_hand_model() -> Path:
    model_dir = Path(__file__).with_name("models")
    model_dir.mkdir(parents=True, exist_ok=True)
    model_path = model_dir / "hand_landmarker.task"
    if not model_path.exists():
        urlretrieve(_HAND_MODEL_URL, model_path)
    return model_path


class _TaskHandsWrapper:
    def __init__(self, landmarker):
        self._landmarker = landmarker
        self._last_ts = 0

    def process(self, rgb):
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        ts = max(int(time.time() * 1000), self._last_ts + 1)
        self._last_ts = ts
        result = self._landmarker.detect_for_video(image, ts)
        hands = [SimpleNamespace(landmark=list(landmark)) for landmark in (result.hand_landmarks or [])]
        return SimpleNamespace(multi_hand_landmarks=hands)

    def close(self):
        self._landmarker.close()


def init_hands(max_num_hands: int = 4):
    """MediaPipe Hands with lightweight settings (model_complexity=0)."""
    if getattr(mp, "solutions", None):
        return mp.solutions.hands.Hands(
            model_complexity=0,
            max_num_hands=max_num_hands,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    from mediapipe.tasks.python.core.base_options import BaseOptions
    from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode
    from mediapipe.tasks.python.vision.hand_landmarker import HandLandmarker, HandLandmarkerOptions

    model_path = _ensure_hand_model()
    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path)),
        running_mode=VisionTaskRunningMode.VIDEO,
        num_hands=max_num_hands,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return _TaskHandsWrapper(HandLandmarker.create_from_options(options))


def _xy(lm) -> Tuple[float, float]:
    return (lm.x, lm.y)


def _distance(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def _bend_angle(hand, mcp_idx: int, pip_idx: int, tip_idx: int) -> float:
    """Angle (radians) between the proximal segment (MCP→PIP) and the distal
    segment (PIP→TIP). ~0 means straight; ~π means folded back on itself.

    This is rotation-invariant in 2D — a finger pointing away from the camera
    still reads as extended, unlike a wrist-distance heuristic which projection
    can fool.
    """
    mcp = (hand.landmark[mcp_idx].x, hand.landmark[mcp_idx].y)
    pip = (hand.landmark[pip_idx].x, hand.landmark[pip_idx].y)
    tip = (hand.landmark[tip_idx].x, hand.landmark[tip_idx].y)
    v1 = (pip[0] - mcp[0], pip[1] - mcp[1])
    v2 = (tip[0] - pip[0], tip[1] - pip[1])
    n1 = math.hypot(*v1)
    n2 = math.hypot(*v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return 0.0
    cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)
    cos = max(-1.0, min(1.0, cos))
    return math.acos(cos)


def _is_curled(hand, mcp_idx: int, pip_idx: int, tip_idx: int,
               angle_threshold: float = 1.6) -> bool:
    """Finger is curled when its MCP→PIP→TIP bend angle is >= ~90°.

    Default threshold 1.6 rad ≈ 92°. Pure V-sign (extended) reads < 0.3 rad;
    fully clenched reads > 2.4 rad.
    """
    return _bend_angle(hand, mcp_idx, pip_idx, tip_idx) >= angle_threshold


def _is_extended(hand, mcp_idx: int, pip_idx: int, tip_idx: int,
                 angle_threshold: float = 0.6) -> bool:
    """Finger is extended when the bend angle is small (< ~35°)."""
    return _bend_angle(hand, mcp_idx, pip_idx, tip_idx) < angle_threshold


# (MCP, PIP, TIP) triples for each non-thumb finger.
_NON_THUMB_FINGERS = (
    (5, 6, 8),    # index
    (9, 10, 12),  # middle
    (13, 14, 16), # ring
    (17, 18, 20), # pinky
)


def _hand_raised(hand, face_ref) -> bool:
    # Image coords: smaller y is higher on screen.
    if face_ref is None:
        return False
    return hand.landmark[0].y < face_ref[1]


def _thumbs_up(hand, _face_ref) -> bool:
    thumb_tip = hand.landmark[4]
    thumb_mcp = hand.landmark[2]
    if thumb_tip.y >= thumb_mcp.y:
        return False
    return all(_is_curled(hand, m, p, t) for m, p, t in _NON_THUMB_FINGERS)


def _thumbs_down(hand, _face_ref) -> bool:
    thumb_tip = hand.landmark[4]
    thumb_mcp = hand.landmark[2]
    if thumb_tip.y <= thumb_mcp.y:
        return False
    return all(_is_curled(hand, m, p, t) for m, p, t in _NON_THUMB_FINGERS)


def _pointing(hand, _face_ref) -> bool:
    # Index strongly extended, middle + ring + pinky clearly curled.
    index_extended = _is_extended(hand, *_NON_THUMB_FINGERS[0])
    others_curled = all(_is_curled(hand, m, p, t) for m, p, t in _NON_THUMB_FINGERS[1:])
    return index_extended and others_curled


def _toilet_request(hand, _face_ref) -> bool:
    """First + last finger extended (rock-on / ILY handshape):
       - index extended
       - middle curled
       - ring curled
       - pinkie extended
    Thumb is unconstrained — works with thumb tucked OR thumb out.
    """
    return (
        _is_extended(hand, 5, 6, 8)      # index
        and _is_curled(hand, 9, 10, 12)  # middle
        and _is_curled(hand, 13, 14, 16) # ring
        and _is_extended(hand, 17, 18, 20)  # pinkie
    )


GESTURE_REGISTRY: List[Tuple[str, Callable]] = [
    ("toilet_request", _toilet_request),
    ("thumbs_up", _thumbs_up),
    ("thumbs_down", _thumbs_down),
    ("hand_raised", _hand_raised),
    ("pointing", _pointing),
]


def gesture_diagnostic(hand) -> dict:
    """Per-finger curl angles + toilet-candidate geometry. Helpful for tuning
    thresholds when a gesture isn't firing as expected."""
    index_mcp = hand.landmark[5]
    middle_mcp = hand.landmark[9]
    thumb_tip = hand.landmark[4]
    y_mid = (index_mcp.y + middle_mcp.y) / 2.0
    x_min, x_max = sorted((index_mcp.x, middle_mcp.x))
    gap = x_max - x_min
    return {
        "index_curl": round(_bend_angle(hand, 5, 6, 8), 2),
        "middle_curl": round(_bend_angle(hand, 9, 10, 12), 2),
        "ring_curl": round(_bend_angle(hand, 13, 14, 16), 2),
        "pinky_curl": round(_bend_angle(hand, 17, 18, 20), 2),
        "thumb_dy": round(thumb_tip.y - y_mid, 3),
        "thumb_in_gap": (x_min <= thumb_tip.x <= x_max) if gap > 1e-4 else False,
        "gap": round(gap, 3),
    }


def classify_gesture(hand_landmarks, face_ref: Optional[Tuple[float, float]] = None) -> str:
    for name, fn in GESTURE_REGISTRY:
        try:
            if fn(hand_landmarks, face_ref):
                return name
        except Exception:
            # A broken detector must not sink the loop — gesture detection is
            # best-effort per frame.
            continue
    return "none"


def assign_hand_to_face(hand_centers: List[Tuple[float, float]],
                        face_centers: List[Tuple[float, float]]) -> Dict[int, Optional[int]]:
    """Greedy-nearest pairing of each face to the closest unused hand.

    Returns {face_idx: hand_idx | None}. Hands left over after the greedy pass
    are dropped — the caller may surface that as an "unattributed gesture".
    """
    used = set()
    result: Dict[int, Optional[int]] = {}
    for fi, fc in enumerate(face_centers):
        best_hi: Optional[int] = None
        best_d = float("inf")
        for hi, hc in enumerate(hand_centers):
            if hi in used:
                continue
            d = _distance(hc, fc)
            if d < best_d:
                best_d = d
                best_hi = hi
        if best_hi is not None:
            used.add(best_hi)
        result[fi] = best_hi
    return result


class GestureHistory:
    """Per-student ring buffer. Push each frame's raw gesture; returns the
    stable gesture (or "none" if the hold threshold hasn't been met)."""

    def __init__(self, window: int = 30):
        self.buf: deque = deque(maxlen=window)

    def push(self, gesture: str) -> str:
        self.buf.append(gesture)
        if len(self.buf) < GESTURE_HOLD_FRAMES:
            return "none"
        tail = list(self.buf)[-GESTURE_HOLD_FRAMES:]
        if tail[0] != "none" and all(g == tail[0] for g in tail):
            return tail[0]
        return "none"
