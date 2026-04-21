"""Emotion classification on a face crop using FER.

Wraps the FER Detector. Instantiate once at module load — it's a CNN and
re-instantiating per frame is the classic "why is my loop slow" bug.

FER.detect_emotions does its own face detection. If you pass it a tight
crop its Haar cascade often fails to re-find a face, and you get the
fallback "neutral/0.0" forever. So the preferred path is to pass the
**full frame + an explicit face_rectangle**; FER then runs classification
only on that region and skips its own detection.

Functions
---------
detect_emotion(frame, face_rect=None) -> dict
    Returns {"emotion": "<label>", "confidence": float}.
    frame: full BGR frame (OpenCV convention).
    face_rect: optional (x, y, w, h). If omitted, FER detects internally.

The 4-class reducer (`happy`, `neutral`, `bored`, `confused`) lives in
`engagement.reduce_emotion_to_four` and is reused from there.
"""

from typing import Optional, Tuple

from fer import FER

# Single shared detector. mtcnn=False uses FER's default Haar-cascade path;
# because we pass an explicit face_rectangles we skip detection anyway.
_DETECTOR = FER(mtcnn=False)


def detect_emotion(frame, face_rect: Optional[Tuple[int, int, int, int]] = None) -> dict:
    kwargs = {}
    if face_rect is not None:
        kwargs["face_rectangles"] = [face_rect]
    results = _DETECTOR.detect_emotions(frame, **kwargs)
    if not results:
        return {"emotion": "neutral", "confidence": 0.0}
    emotions = results[0]["emotions"]
    label, score = max(emotions.items(), key=lambda kv: kv[1])
    return {"emotion": label, "confidence": float(score)}
