"""Diagnostic: dump enrolled_student_ids for every lecture, plus whether each
student has a face_encoding. Run this when the capture app reports
"no enrolled encodings loaded for this lecture"."""
import os
from pathlib import Path
from dotenv import load_dotenv
import firebase_writer

load_dotenv(Path(__file__).with_name(".env"))
db = firebase_writer.init_firebase()

print(f"Firestore mode: {'EMULATOR' if os.getenv('FIRESTORE_EMULATOR_HOST') else 'PROD'}")
print()

lectures = list(db.collection("lectures").stream())
print(f"=== {len(lectures)} lectures total ===")
for snap in lectures:
    d = snap.to_dict() or {}
    ids = d.get("enrolled_student_ids") or []
    print(f"\n{snap.id}  ({d.get('title')!r}, status={d.get('status')})")
    print(f"  enrolled_student_ids: {ids}")
    if not ids:
        continue
    for sid in ids:
        s = db.collection("students").document(sid).get()
        if not s.exists:
            print(f"    - {sid}  MISSING student doc")
            continue
        sd = s.to_dict() or {}
        enc = sd.get("face_encoding")
        flag = "ENC" if enc else "no encoding"
        elen = f"len={len(enc)}" if isinstance(enc, list) else "—"
        print(f"    - {sid}  {sd.get('name')!r}  [{flag}, {elen}]")

print("\n=== students collection ===")
students = list(db.collection("students").stream())
print(f"{len(students)} student docs total")
encoded = 0
for s in students:
    sd = s.to_dict() or {}
    if sd.get("face_encoding"):
        encoded += 1
print(f"  with face_encoding: {encoded}")
print(f"  without: {len(students) - encoded}")
