"""Firebase + CSV writer for the classroom capture app.

One init_firebase() call at startup; then all Firestore writes flow through
this module so the OpenCV loop never touches firebase-admin directly.

Emulator vs prod
----------------
When FIRESTORE_EMULATOR_HOST is set, firebase-admin is initialised with a
google.auth.AnonymousCredentials wrapper — the emulator ignores credentials
anyway. In prod the service-account JSON path in FIREBASE_SERVICE_ACCOUNT_JSON
is required.

CSV format (in sync with the Firestore fields):
    student_id, lecture_id, timestamp, emotion, confidence,
    state, sleep_reason, gesture, engagement_score
"""

import csv
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import firebase_admin
from firebase_admin import credentials, firestore, storage
from google.auth.credentials import AnonymousCredentials


_db = None
_bucket = None
_buffer: List[Dict[str, Any]] = []
_buf_lock = threading.Lock()
_csv_lock = threading.Lock()

_CSV_COLUMNS = [
    "student_id", "lecture_id", "timestamp", "emotion", "confidence",
    "state", "sleep_reason", "gesture", "engagement_score",
]


class _EmulatorCredential(credentials.Base):
    """Anonymous credentials wrapper so firebase_admin.initialize_app() is
    happy against the local emulator — which ignores auth anyway."""

    def get_credential(self):
        return AnonymousCredentials()


def _project_id() -> str:
    pid = os.getenv("FIREBASE_PROJECT_ID")
    if not pid:
        raise RuntimeError("FIREBASE_PROJECT_ID is not set")
    return pid


def init_firebase():
    """Initialise firebase-admin once, return the Firestore client."""
    global _db, _bucket
    if firebase_admin._apps:
        _db = firestore.client()
        _bucket = storage.bucket()
        return _db

    project_id = _project_id()
    if os.getenv("FIRESTORE_EMULATOR_HOST"):
        cred = _EmulatorCredential()
    else:
        key_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not key_path:
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_JSON must point at the prod "
                "service-account JSON when emulator mode is off."
            )
        cred = credentials.Certificate(key_path)

    firebase_admin.initialize_app(cred, {
        "projectId": project_id,
        "storageBucket": f"{project_id}.appspot.com",
    })
    _db = firestore.client()
    _bucket = storage.bucket()
    return _db


def get_db():
    if _db is None:
        raise RuntimeError("firebase_writer.init_firebase() has not been called")
    return _db


def _csv_path() -> Path:
    p = Path(os.getenv("CSV_PATH", "../data/emotions.csv"))
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _append_csv_rows(rows: List[Dict[str, Any]]) -> None:
    path = _csv_path()
    exists = path.exists()
    with _csv_lock, path.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=_CSV_COLUMNS)
        if not exists:
            writer.writeheader()
        for row in rows:
            writer.writerow({
                col: (row.get(col).isoformat() if col == "timestamp"
                      and hasattr(row.get(col), "isoformat") else row.get(col))
                for col in _CSV_COLUMNS
            })


def save_observation(student_id: str, lecture_id: str, emotion: str,
                     confidence: float, state: str, sleep_reason: Optional[str],
                     gesture: str, engagement_score: float,
                     timestamp: Optional[datetime] = None) -> None:
    """Buffer a single observation. Caller flushes every SAVE_INTERVAL_SECONDS."""
    row = {
        "student_id": student_id,
        "lecture_id": lecture_id,
        "timestamp": timestamp or datetime.now(timezone.utc),
        "emotion": emotion,
        "confidence": float(confidence),
        "state": state,
        "sleep_reason": sleep_reason,
        "gesture": gesture,
        "engagement_score": float(engagement_score),
    }
    with _buf_lock:
        _buffer.append(row)


def flush_buffer() -> int:
    """Flush buffered observations to Firestore (batched) + CSV. Returns row count."""
    with _buf_lock:
        rows = list(_buffer)
        _buffer.clear()
    if not rows:
        return 0

    db = get_db()
    batch = db.batch()
    col = db.collection("emotions")
    for row in rows:
        doc_ref = col.document()
        batch.set(doc_ref, row)
    batch.commit()

    _append_csv_rows(rows)
    return len(rows)


def set_lecture_status(lecture_id: str, status: str) -> None:
    """status in {'scheduled', 'recording', 'finished'}. Stamps finalized_at on finish."""
    db = get_db()
    patch = {"status": status}
    if status == "finished":
        patch["finalized_at"] = datetime.now(timezone.utc)
    db.collection("lectures").document(lecture_id).update(patch)


def upload_audio(lecture_id: str, wav_path: str) -> str:
    """Upload the full-lecture WAV to Storage and patch lectures.audio_url."""
    if _bucket is None:
        raise RuntimeError("firebase_writer.init_firebase() has not been called")
    blob_name = f"lectures/{lecture_id}/audio.wav"
    blob = _bucket.blob(blob_name)
    blob.upload_from_filename(wav_path, content_type="audio/wav")
    # Emulator + prod both expose a public-ish URL via the underlying client.
    url = blob.public_url
    get_db().collection("lectures").document(lecture_id).update({"audio_url": url})
    return url


def create_transcript_doc(lecture_id: str, language: str) -> str:
    """Create the parent transcripts/{id} doc. Returns transcript_id."""
    db = get_db()
    now = datetime.now(timezone.utc)
    doc_ref = db.collection("transcripts").document()
    doc_ref.set({
        "transcript_id": doc_ref.id,
        "lecture_id": lecture_id,
        "language": language,
        "started_at": now,
        "last_updated_at": now,
        "segment_count": 0,
        "completed": False,
    })
    db.collection("lectures").document(lecture_id).update({"transcript_id": doc_ref.id})
    return doc_ref.id


def save_transcript_segment(transcript_id: str, chunk_index: int,
                            start: float, end: float, text: str) -> None:
    """Append one segment under transcripts/{id}/segments and bump the parent."""
    db = get_db()
    seg_col = db.collection("transcripts").document(transcript_id).collection("segments")
    seg_col.add({
        "chunk_index": chunk_index,
        "start": float(start),
        "end": float(end),
        "text": text,
        "created_at": datetime.now(timezone.utc),
    })
    db.collection("transcripts").document(transcript_id).update({
        "last_updated_at": datetime.now(timezone.utc),
        "segment_count": firestore.Increment(1),
    })


def mark_transcript_completed(transcript_id: str) -> None:
    get_db().collection("transcripts").document(transcript_id).update({
        "completed": True,
        "last_updated_at": datetime.now(timezone.utc),
    })
