"""Bulk-enroll students from a folder of photos.

Each file in <folder> must be named like:
    <student_id>_<name>.<ext>      e.g. 211014850_Marwan_Mohamed_Khalaf.jpg
or:
    <name>_<student_id>.<ext>      e.g. Marwan_Mohamed_Khalaf_211014850.jpg

The numeric token is taken as the student_id; the rest (with underscores
replaced by spaces) becomes the name. Supported extensions: .jpg .jpeg .png.

For each photo we compute a face_recognition encoding and upsert
    students/{student_id}
in Firestore. The raw photo is also uploaded to Storage at
    students/{student_id}/face.<ext>
and its public URL stored on the doc.

Usage:
    python bulk_enroll.py <folder> [--lecture <lecture_id>] [--skip-existing]
                                   [--no-upload]

When the emulator is started via scripts/start-emulators.ps1 (which uses
--export-on-exit=./seed), all of these writes are persisted to disk on
Ctrl+C — re-importing automatically on the next start.
"""

import argparse
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
import face_recognition

import firebase_writer


SUPPORTED_EXTS = {".jpg", ".jpeg", ".png"}
ID_RE = re.compile(r"\d{4,}")  # student id = run of >=4 digits


def parse_filename(stem: str):
    """Return (student_id, name) parsed from the filename stem.

    Accepts both `<id>_<name>` and `<name>_<id>`. Returns (None, None)
    if no numeric id token is found.
    """
    parts = stem.split("_")
    if not parts:
        return None, None

    if ID_RE.fullmatch(parts[0]):
        sid = parts[0]
        name = " ".join(parts[1:]).strip()
    elif ID_RE.fullmatch(parts[-1]):
        sid = parts[-1]
        name = " ".join(parts[:-1]).strip()
    else:
        return None, None

    return sid, name or sid


def encode_one(image_path: Path):
    try:
        image = face_recognition.load_image_file(str(image_path))
    except Exception as e:
        return None, f"unreadable image ({type(e).__name__}: {e})"
    locations = face_recognition.face_locations(image)
    if not locations:
        return None, "no face detected"
    if len(locations) > 1:
        # pick the largest face rather than skipping — bulk import is best-effort
        locations.sort(key=lambda b: (b[2] - b[0]) * (b[1] - b[3]), reverse=True)
        locations = [locations[0]]
    enc = face_recognition.face_encodings(image, known_face_locations=locations)[0]
    return enc, None


def upload_photo(bucket, student_id: str, image_path: Path) -> str:
    blob_name = f"students/{student_id}/face{image_path.suffix.lower()}"
    blob = bucket.blob(blob_name)
    content_type = "image/jpeg" if image_path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    blob.upload_from_filename(str(image_path), content_type=content_type)
    return blob.public_url


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", help="Folder containing the student photos")
    ap.add_argument("--lecture", help="Optional lecture_id; enrolls all students into it", default=None)
    ap.add_argument("--skip-existing", action="store_true",
                    help="Skip students that already have a doc with face_encoding")
    ap.add_argument("--no-upload", action="store_true",
                    help="Skip uploading the raw photo to Storage")
    args = ap.parse_args()

    folder = Path(args.folder)
    if not folder.is_dir():
        print(f"Not a directory: {folder}")
        return 2

    load_dotenv()
    db = firebase_writer.init_firebase()
    bucket = firebase_writer._bucket  # set by init_firebase

    files = sorted(p for p in folder.iterdir()
                   if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS)
    if not files:
        print(f"No images found in {folder}")
        return 1

    print(f"Found {len(files)} images. Starting bulk enrollment...")
    ok = skipped = failed = 0
    enrolled_ids: list[str] = []

    for path in files:
        sid, name = parse_filename(path.stem)
        if sid is None:
            print(f"  [skip] {path.name}: cannot parse <id>_<name>")
            failed += 1
            continue

        if args.skip_existing:
            snap = db.collection("students").document(sid).get()
            if snap.exists and snap.to_dict().get("face_encoding"):
                print(f"  [skip] {sid} ({name}): already enrolled")
                skipped += 1
                enrolled_ids.append(sid)
                continue

        encoding, err = encode_one(path)
        if encoding is None:
            print(f"  [fail] {sid} ({name}): {err}")
            failed += 1
            continue

        photo_url = None
        if not args.no_upload:
            try:
                photo_url = upload_photo(bucket, sid, path)
            except Exception as e:
                print(f"  [warn] {sid}: photo upload failed ({e}); continuing without URL")

        doc = {
            "student_id": sid,
            "name": name,
            "email": f"{sid}@example.local",
            "face_encoding": encoding.tolist(),
            "face_photo_url": photo_url,
            "created_by": "bulk-enrollment",
            "created_at": datetime.now(timezone.utc),
            "active": True,
        }
        db.collection("students").document(sid).set(doc, merge=True)
        enrolled_ids.append(sid)
        ok += 1
        print(f"  [ok]   {sid}  {name}")

    if args.lecture and enrolled_ids:
        from google.cloud.firestore import ArrayUnion
        lec_ref = db.collection("lectures").document(args.lecture)
        snap = lec_ref.get()
        if not snap.exists:
            lec_ref.set({
                "lecture_id": args.lecture,
                "title": f"Bulk-enrolled {args.lecture}",
                "doctor_id": "doc_bulk",
                "date": datetime.now(timezone.utc),
                "subject": "Bulk",
                "status": "scheduled",
                "enrolled_student_ids": enrolled_ids,
            })
            print(f"Created lecture {args.lecture} with {len(enrolled_ids)} students.")
        else:
            lec_ref.update({"enrolled_student_ids": ArrayUnion(enrolled_ids)})
            print(f"Added {len(enrolled_ids)} students to lectures/{args.lecture}.")

    print(f"\nDone. ok={ok}  skipped={skipped}  failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
