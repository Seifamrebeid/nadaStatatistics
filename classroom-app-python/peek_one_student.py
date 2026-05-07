from pathlib import Path
from dotenv import load_dotenv
import firebase_writer
load_dotenv(Path(__file__).with_name(".env"))
db = firebase_writer.init_firebase()
for s in db.collection("students").limit(1).stream():
    d = s.to_dict() or {}
    enc = d.get("face_encoding")
    if isinstance(enc, list):
        d["face_encoding"] = f"<list len={len(enc)}>"
    print(s.id, d)
for w in db.collection("weeks").limit(1).stream():
    print(w.id, w.to_dict())
