"""FastAPI service for browser-driven classroom capture.

The web UI sends one JPEG frame per request (~5 FPS); we run the same
face_recognition + FER pipeline used by the desktop capture app, persist
each detection to Firestore, and return a small JSON payload so the
browser can draw overlays.

Run with:
    uvicorn api_server:app --host 127.0.0.1 --port 8001 --reload
"""

from __future__ import annotations

import base64
import io
import time
from typing import Dict, List, Optional

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

# Load .env BEFORE importing modules that read env vars at import time.
load_dotenv()

from emotion import detect_emotion
from engagement import engagement_score
from face_id import (
    face_locations_only,
    identify_locations,
    load_enrolled_encodings,
)
from firebase_writer import init_firebase

app = FastAPI(title="Classroom Capture API")

# Vite dev servers (5173–5180) and any localhost origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── State ────────────────────────────────────────────────────────────
_db = None
# Cached enrollments per lecture: {lecture_id: ({sid: encoding}, {sid: name})}
_enrollments: Dict[str, tuple] = {}
# Per-student last emotion result. Emotion detection is the slowest step,
# so we only recompute every EMOTION_EVERY_N requests and reuse otherwise.
_last_emotion: Dict[str, dict] = {}
_request_counter = 0
EMOTION_EVERY_N = 3        # FER (emotion) — every 3rd request
IDENTIFY_EVERY_N = 3       # face encoding + match — every 3rd request (~200ms saved on the others)

# Last identified faces per lecture: lecture_id -> list[{"box":..., "student_id":..., "distance":...}]
_last_identified: Dict[str, list] = {}


def _iou(a, b) -> float:
    """IoU of two boxes in (top, right, bottom, left) order."""
    at, ar, ab, al = a
    bt, br, bb, bl = b
    inter_t = max(at, bt); inter_l = max(al, bl)
    inter_b = min(ab, bb); inter_r = min(ar, br)
    iw = max(0, inter_r - inter_l); ih = max(0, inter_b - inter_t)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0, ar - al) * max(0, ab - at)
    area_b = max(0, br - bl) * max(0, bb - bt)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _reuse_identity(box, prev: list, iou_thresh: float = 0.35):
    """Find the previous identified box with highest IoU; return its identity
    if it clears the threshold, else (unknown, None)."""
    best = None
    best_iou = 0.0
    for p in prev:
        i = _iou(box, p["box"])
        if i > best_iou:
            best_iou = i
            best = p
    if best and best_iou >= iou_thresh:
        return best["student_id"], best.get("distance")
    return "unknown", None


@app.on_event("startup")
def _startup() -> None:
    global _db
    _db = init_firebase()
    print("[api] Firebase initialised")


# ── Helpers ──────────────────────────────────────────────────────────
def _decode_jpeg_b64(b64: str) -> np.ndarray:
    """Browser sends `data:image/jpeg;base64,<...>` — strip prefix, decode."""
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(img)  # RGB ndarray, matches face_recognition's expectation


def _get_enrollment(lecture_id: str):
    """Cache enrolled face encodings per lecture so we don't re-fetch each frame."""
    if lecture_id not in _enrollments:
        _enrollments[lecture_id] = load_enrolled_encodings(_db, lecture_id)
    return _enrollments[lecture_id]


# ── Models ───────────────────────────────────────────────────────────
class DetectRequest(BaseModel):
    lecture_id: str
    frame: str  # base64 JPEG (with or without data: prefix)
    write_to_firestore: bool = True


class FaceResult(BaseModel):
    student_id: str
    name: Optional[str] = None
    # (top, right, bottom, left) — same as face_recognition's convention
    box: List[int]
    emotion: str
    confidence: float
    engagement_score: float
    state: str
    distance: Optional[float] = None


class DetectResponse(BaseModel):
    faces: List[FaceResult]
    fps_hint: float
    elapsed_ms: float


# ── Endpoints ────────────────────────────────────────────────────────
@app.get("/health")
def health() -> dict:
    return {"ok": True, "lectures_cached": list(_enrollments.keys())}


@app.post("/enrollment/refresh/{lecture_id}")
def refresh_enrollment(lecture_id: str) -> dict:
    """Force-reload the enrolled face encodings for a lecture."""
    _enrollments.pop(lecture_id, None)
    encs, names = _get_enrollment(lecture_id)
    return {"lecture_id": lecture_id, "enrolled": len(encs)}


@app.post("/detect", response_model=DetectResponse)
def detect(req: DetectRequest) -> DetectResponse:
    if _db is None:
        raise HTTPException(503, "Firebase not initialised yet")

    global _request_counter
    t0 = time.perf_counter()

    try:
        frame = _decode_jpeg_b64(req.frame)
    except Exception as e:
        raise HTTPException(400, f"Bad frame: {e}")

    encs, names = _get_enrollment(req.lecture_id)

    _request_counter += 1
    run_emotion  = (_request_counter % EMOTION_EVERY_N) == 0
    run_identify = (_request_counter % IDENTIFY_EVERY_N) == 0

    # Step 1 — face_locations every frame (HOG, ~30-60 ms on 480px).
    locations = face_locations_only(frame, upsample=0)

    # Step 2 — identity. Either recompute (encoding + match, slow) or reuse
    # the last identified set by IoU (cheap).
    prev_identified = _last_identified.get(req.lecture_id, [])
    if run_identify or not prev_identified:
        detections = identify_locations(frame, locations, encs)
        _last_identified[req.lecture_id] = detections
    else:
        detections = []
        for box in locations:
            sid, distance = _reuse_identity(box, prev_identified)
            detections.append({"box": box, "student_id": sid, "distance": distance})

    faces: List[FaceResult] = []
    batch = []
    for d in detections:
        top, right, bottom, left = d["box"]
        x, y, w, h = left, top, right - left, bottom - top
        sid = d["student_id"]
        # Emotion is the slowest step (~80-150 ms per face). Run it every
        # Nth request and reuse the last result in between, keyed by sid.
        # For unknown faces we use the box position as a stable-ish key.
        key = sid if sid != "unknown" else f"unk_{top}_{left}"
        if run_emotion or key not in _last_emotion:
            emo = detect_emotion(frame, face_rect=(x, y, w, h))
            _last_emotion[key] = emo
        else:
            emo = _last_emotion[key]
        score = engagement_score(emo["emotion"], state="awake", gesture="none")
        face = FaceResult(
            student_id=sid,
            name=names.get(sid) if sid != "unknown" else None,
            box=[top, right, bottom, left],
            emotion=emo["emotion"],
            confidence=emo["confidence"],
            engagement_score=round(score * 100, 1),
            state="awake",
            distance=d.get("distance"),
        )
        faces.append(face)

        if req.write_to_firestore and sid != "unknown":
            batch.append({
                "student_id": sid,
                "lecture_id": req.lecture_id,
                "emotion": emo["emotion"],
                "confidence": emo["confidence"],
                "engagement_score": round(score * 100, 1),
                "state": "awake",
                "face_count": len(detections),
                "source": "web-api",
            })

    # Fire-and-forget Firestore writes (one doc per face)
    if batch and _db is not None:
        from google.cloud.firestore_v1 import SERVER_TIMESTAMP
        for row in batch:
            row["timestamp"] = SERVER_TIMESTAMP
            try:
                _db.collection("emotions").add(row)
            except Exception as e:
                print(f"[api] firestore write failed: {e}")

    elapsed = (time.perf_counter() - t0) * 1000
    return DetectResponse(
        faces=faces,
        fps_hint=1000.0 / max(elapsed, 1.0),
        elapsed_ms=round(elapsed, 1),
    )
