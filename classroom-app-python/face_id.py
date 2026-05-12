"""Face detection + identification against enrolled students.

Wraps `face_recognition` (dlib-backed — on Windows, dlib-bin provides the same
module without the compile headache). Loads a lecture's enrolled encodings at
startup, then on each processed frame returns the list of detected faces along
with the best-matching student_id (or "unknown").
"""

from typing import Dict, List, Optional, Tuple

import face_recognition
import numpy as np


def load_enrolled_encodings(db, lecture_id: str) -> Tuple[Dict[str, np.ndarray], Dict[str, str]]:
    """Return ({student_id: encoding}, {student_id: name}) for the lecture's roster.

    Students without a face_encoding are skipped (they are invisible to the
    classroom app until admin uploads a photo — documented on the admin UI).
    Students without a `name` field fall back to their student_id.
    """
    lecture_ref = db.collection("lectures").document(lecture_id).get()
    if not lecture_ref.exists:
        raise ValueError(f"lecture {lecture_id} not found")
    enrolled_ids = lecture_ref.to_dict().get("enrolled_student_ids", [])

    encodings: Dict[str, np.ndarray] = {}
    names: Dict[str, str] = {}
    for sid in enrolled_ids:
        snap = db.collection("students").document(sid).get()
        if not snap.exists:
            continue
        data = snap.to_dict()
        enc = data.get("face_encoding")
        if enc:
            encodings[sid] = np.asarray(enc, dtype=np.float64)
            names[sid] = data.get("name") or sid
    return encodings, names


def face_locations_only(frame, upsample: int = 0) -> List[Tuple[int, int, int, int]]:
    """Just the HOG box pass — no encoding, no matching. ~3-5x cheaper than
    detect_and_identify when you only need overlay boxes between identity
    refreshes.
    """
    return face_recognition.face_locations(frame, number_of_times_to_upsample=upsample)


def identify_locations(frame, locations, enrolled: Dict[str, np.ndarray],
                       tolerance: float = 0.6,
                       num_jitters: int = 0) -> List[dict]:
    """Compute encodings for the given locations and match against enrolled.

    Same shape as `detect_and_identify` so callers can be uniform. Pull this
    apart from face_locations so a fast inner loop can detect every frame
    but only identify every Nth.
    """
    out: List[dict] = []
    if not locations:
        return out
    encodings = face_recognition.face_encodings(
        frame, known_face_locations=locations, num_jitters=num_jitters
    )
    ids = list(enrolled.keys())
    known = np.array([enrolled[i] for i in ids]) if ids else np.zeros((0, 128))
    for box, enc in zip(locations, encodings):
        student_id = "unknown"
        distance: Optional[float] = None
        if known.shape[0] > 0:
            dists = face_recognition.face_distance(known, enc)
            j = int(np.argmin(dists))
            distance = float(dists[j])
            if distance < tolerance:
                student_id = ids[j]
        out.append({"box": box, "student_id": student_id, "distance": distance})
    return out


def detect_and_identify(frame, enrolled: Dict[str, np.ndarray],
                        tolerance: float = 0.6,
                        upsample: int = 0,
                        num_jitters: int = 0) -> List[dict]:
    """Detect every face in the frame and attach a student_id to each.

    Returns a list of {"box": (top, right, bottom, left), "student_id": str,
    "distance": float | None}. student_id is "unknown" when no enrolled
    encoding falls within the match tolerance.

    upsample=0 is ~3x faster than the default 1 — fine when faces are
    already ≥100 px (we feed in 480px frames from the browser).
    num_jitters=0 skips the encoding's random re-sampling pass; the
    embedding is slightly noisier but the loop is ~2x faster.
    """
    locations = face_recognition.face_locations(frame, number_of_times_to_upsample=upsample)
    if not locations:
        return []

    encodings = face_recognition.face_encodings(
        frame, known_face_locations=locations, num_jitters=num_jitters
    )

    ids = list(enrolled.keys())
    known = np.array([enrolled[i] for i in ids]) if ids else np.zeros((0, 128))

    results: List[dict] = []
    for box, enc in zip(locations, encodings):
        student_id = "unknown"
        distance: Optional[float] = None
        if known.shape[0] > 0:
            dists = face_recognition.face_distance(known, enc)
            j = int(np.argmin(dists))
            if float(dists[j]) < tolerance:
                student_id = ids[j]
                distance = float(dists[j])
        results.append({"box": box, "student_id": student_id, "distance": distance})
    return results
