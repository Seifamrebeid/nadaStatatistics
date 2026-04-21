"""Phone-usage detection via YOLOv8 nano.

Detects the COCO "cell phone" class (id 67) in each frame and returns bounding
boxes. The capture pipeline pairs each phone with its nearest face and flags
the student as "using phone" when the phone is within a reasonable distance of
their face.

Single shared model instance — loads weights once; subsequent calls are fast.

Functions
---------
detect_phones(frame, conf=0.35) -> list[dict]
    Returns [{"box": (x1, y1, x2, y2), "confidence": float}, ...].

phone_near_face(phone_box, face_box, max_multiple=2.0) -> bool
    True when the centers are within `max_multiple * face_width` of each other.
"""

import os
import sys
from typing import List, Tuple

from ultralytics import YOLO


_PHONE_CLASS = 67  # COCO class id for "cell phone"


def _load_model():
    try:
        # yolov8n auto-downloads weights (~6 MB) on first use.
        model = YOLO("yolov8n.pt")
        return model
    except Exception as e:
        print(f"phone_detector: YOLOv8 load failed ({e}); phone detection disabled.",
              file=sys.stderr)
        return None


_MODEL = _load_model()


def detect_phones(frame, conf: float = 0.35) -> List[dict]:
    if _MODEL is None:
        return []
    try:
        # classes=[67] filters to cell phone only inside ultralytics — faster.
        results = _MODEL.predict(
            frame, classes=[_PHONE_CLASS], conf=conf,
            verbose=False, imgsz=320,
        )
    except Exception:
        return []

    phones: List[dict] = []
    for r in results:
        if r.boxes is None:
            continue
        for b in r.boxes:
            x1, y1, x2, y2 = map(int, b.xyxy[0].tolist())
            phones.append({
                "box": (x1, y1, x2, y2),
                "confidence": float(b.conf[0]),
            })
    return phones


def _center(box: Tuple[int, int, int, int]) -> Tuple[float, float]:
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def phone_near_face(phone_box: Tuple[int, int, int, int],
                    face_box_trbl: Tuple[int, int, int, int],
                    max_multiple: float = 2.0) -> bool:
    """`face_box_trbl` is (top, right, bottom, left) — face_recognition format.
    Phone is considered "near" when the distance between centers is less than
    `max_multiple` times the face width.
    """
    top, right, bottom, left = face_box_trbl
    face_w = right - left
    if face_w <= 0:
        return False
    fx = (left + right) / 2.0
    fy = (top + bottom) / 2.0
    px, py = _center(phone_box)
    dist = ((fx - px) ** 2 + (fy - py) ** 2) ** 0.5
    return dist < max_multiple * face_w
