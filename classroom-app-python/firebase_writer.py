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
    state, sleep_reason, gesture, engagement_score,
    yawning, yawn_reason, attention_score, attention_warning,
    cheat_score, cheat_warning, subtitle_text, face_count
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
    "yawning", "yawn_reason",
    "attention_score", "attention_warning",
    "cheat_score", "cheat_warning",
    "subtitle_text", "face_count",
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


_EMULATOR_ENV_VARS = (
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "FIREBASE_STORAGE_EMULATOR_HOST",
    "STORAGE_EMULATOR_HOST",
)


def init_firebase():
    """Initialise firebase-admin once, return the Firestore client.

    When FIREBASE_SERVICE_ACCOUNT_JSON is set the app always connects to
    real Firebase — all emulator env vars are stripped so a stale shell
    environment can never redirect writes to a local emulator.
    """
    global _db, _bucket
    if firebase_admin._apps:
        _db = firestore.client()
        _bucket = storage.bucket()
        return _db

    project_id = _project_id()
    key_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()

    if key_path:
        # Production mode: clear every emulator variable so they cannot
        # silently redirect Firestore / Storage writes.
        for var in _EMULATOR_ENV_VARS:
            os.environ.pop(var, None)

        # Resolve relative paths relative to this file's directory so the
        # app works regardless of the current working directory.
        resolved = Path(key_path)
        if not resolved.is_absolute():
            resolved = (Path(__file__).parent / resolved).resolve()
        if not resolved.exists():
            raise RuntimeError(
                f"Service-account file not found: {resolved}\n"
                f"(from FIREBASE_SERVICE_ACCOUNT_JSON={key_path!r})"
            )
        cred = credentials.Certificate(str(resolved))
        print(f"[firebase] using real Firebase — project={project_id}", flush=True)
    else:
        # Emulator mode (explicit — key path not provided).
        emu_host = os.getenv("FIRESTORE_EMULATOR_HOST", "")
        if not emu_host:
            raise RuntimeError(
                "Set FIREBASE_SERVICE_ACCOUNT_JSON (real Firebase) or "
                "FIRESTORE_EMULATOR_HOST (emulator)."
            )
        # Sync STORAGE_EMULATOR_HOST from FIREBASE_STORAGE_EMULATOR_HOST.
        fs_host = os.getenv("FIREBASE_STORAGE_EMULATOR_HOST", "")
        if fs_host and not os.getenv("STORAGE_EMULATOR_HOST"):
            if not fs_host.startswith(("http://", "https://")):
                fs_host = "http://" + fs_host
            os.environ["STORAGE_EMULATOR_HOST"] = fs_host
        cred = _EmulatorCredential()
        print(f"[firebase] using LOCAL EMULATOR — host={emu_host}", flush=True)

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
                     yawning: bool = False, yawn_reason: Optional[str] = None,
                     attention_score: Optional[float] = None,
                     attention_warning: bool = False,
                     cheat_score: Optional[float] = None,
                     cheat_warning: bool = False,
                     subtitle_text: Optional[str] = None,
                     face_count: Optional[int] = None,
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
        "yawning": bool(yawning),
        "yawn_reason": yawn_reason,
        "attention_score": attention_score,
        "attention_warning": bool(attention_warning),
        "cheat_score": cheat_score,
        "cheat_warning": bool(cheat_warning),
        "subtitle_text": subtitle_text,
        "face_count": face_count,
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


def mark_attendance_present(
    lecture_id: str,
    student_id: str,
    class_id: Optional[str] = None,
    subject_id: Optional[str] = None,
    doctor_id: Optional[str] = None,
) -> None:
    """Auto-mark a student present when their face is first detected this session."""
    db = get_db()
    doc_id = f"{lecture_id}_{student_id}"
    db.collection("attendance").document(doc_id).set({
        "lecture_id": lecture_id,
        "student_id": student_id,
        "class_id": class_id,
        "subject_id": subject_id,
        "doctor_id": doctor_id,
        "status": "present",
        "auto_detected": True,
        "detected_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }, merge=True)


def write_warning(
    student_id: str,
    lecture_id: str,
    warning_type: str,
    score: float,
) -> None:
    """Write a real-time warning event (attention or cheating) to Firestore."""
    db = get_db()
    db.collection("warnings").add({
        "student_id": student_id,
        "lecture_id": lecture_id,
        "type": warning_type,
        "score": round(float(score), 1),
        "timestamp": datetime.now(timezone.utc),
    })


def write_recommendation(
    student_id: str,
    lecture_id: str,
    items: list,
    attention_score: float,
    attendance_rate: Optional[float] = None,
) -> None:
    """Upsert a recommendations document for a student (per lecture)."""
    db = get_db()
    doc_id = f"{lecture_id}_{student_id}"
    db.collection("recommendations").document(doc_id).set({
        "student_id": student_id,
        "lecture_id": lecture_id,
        "items": items,
        "attention_score": round(float(attention_score), 1),
        "attendance_rate": attendance_rate,
        "generated_at": datetime.now(timezone.utc),
    }, merge=True)
