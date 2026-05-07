"""Quick seeder for enrolled_student_ids on lectures.

The seed shipped lectures with empty rosters, so the capture app's
face_recognition step has nothing to match against. This script writes
`enrolled_student_ids` on lectures so identification can run.

Usage examples:
    # Enroll everyone into every lecture currently in 'recording' status
    python seed_enrollments.py --all-recording

    # Enroll everyone into a specific lecture
    python seed_enrollments.py --lecture lec_2691ac6c81

    # Enroll just N students (smaller demo set)
    python seed_enrollments.py --lecture lec_2691ac6c81 --limit 10
"""

import argparse
import sys
from pathlib import Path
from dotenv import load_dotenv
import firebase_writer


def get_student_ids(db, limit: int | None) -> list[str]:
    q = db.collection("students").stream()
    ids = []
    for snap in q:
        d = snap.to_dict() or {}
        # Only enroll students with a face_encoding — others are useless to the
        # recognition pipeline.
        if not d.get("face_encoding"):
            continue
        ids.append(snap.id)
        if limit and len(ids) >= limit:
            break
    return ids


def lectures_to_update(db, args) -> list[str]:
    if args.lecture:
        return [args.lecture]
    if args.all_recording:
        return [s.id for s in db.collection("lectures").where("status", "in", ["scheduled", "recording"]).stream()]
    if args.all:
        return [s.id for s in db.collection("lectures").stream()]
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--lecture", help="lecture id to enroll into")
    g.add_argument("--all-recording", action="store_true", help="enroll into every scheduled/recording lecture")
    g.add_argument("--all", action="store_true", help="enroll into every lecture")
    ap.add_argument("--limit", type=int, default=None,
                    help="cap the number of students per lecture (default: all)")
    args = ap.parse_args()

    load_dotenv(Path(__file__).with_name(".env"))
    db = firebase_writer.init_firebase()

    student_ids = get_student_ids(db, args.limit)
    if not student_ids:
        print("No students with face_encoding found — nothing to enrol.")
        return 1
    print(f"Enrolling {len(student_ids)} student(s) per lecture.")

    targets = lectures_to_update(db, args)
    if not targets:
        print("No lectures matched the selector.")
        return 2
    print(f"Updating {len(targets)} lecture(s).")

    n_ok = 0
    for lid in targets:
        try:
            db.collection("lectures").document(lid).update({
                "enrolled_student_ids": student_ids,
            })
            n_ok += 1
        except Exception as e:
            print(f"  {lid}: FAILED ({e})")
    print(f"Done. {n_ok}/{len(targets)} lectures updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
