"""Manual student enrollment — writes a Firestore `students` doc with the
face_encoding computed from an enrollment photo, and (optionally) adds the
student to a lecture's enrolled_student_ids.

Normally the R Plumber backend handles this flow via
    POST /api/students/<id>/face
but Phase 3 isn't built yet, so this script is the stopgap for testing the
Python classroom app in isolation.

Usage:
    python enroll_student.py <image_path> <student_id> <name> [lecture_id]

Example:
    python enroll_student.py C:\\Users\\Seifa\\selfie.jpg stu_seif "Seif Abd" lec_test_001

Side effects:
    - Upserts students/{student_id} with face_encoding + metadata
    - (optional) Appends {student_id} to lectures/{lecture_id}.enrolled_student_ids

Does NOT upload the raw photo to Storage or create a users/{uid} doc — that is
the admin-UI job. For pure classroom-app testing you only need the encoding.
"""

import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
import face_recognition

import firebase_writer


def main() -> int:
    if len(sys.argv) not in (4, 5):
        print(__doc__)
        return 2

    image_path = sys.argv[1]
    student_id = sys.argv[2]
    name = sys.argv[3]
    lecture_id = sys.argv[4] if len(sys.argv) == 5 else None

    load_dotenv()
    db = firebase_writer.init_firebase()

    try:
        image = face_recognition.load_image_file(image_path)
    except (FileNotFoundError, OSError) as e:
        print(f"Could not read image: {e}")
        return 3

    locations = face_recognition.face_locations(image)
    if not locations:
        print("No face detected in photo. Retake with better lighting and frontal pose.")
        return 1
    if len(locations) > 1:
        print(f"{len(locations)} faces detected. Enrollment requires exactly one.")
        return 1

    encoding = face_recognition.face_encodings(image, known_face_locations=locations)[0]

    doc = {
        "student_id": student_id,
        "name": name,
        "email": f"{student_id}@example.local",
        "face_encoding": encoding.tolist(),
        "face_photo_url": None,
        "created_by": "manual-enrollment",
        "created_at": datetime.now(timezone.utc),
        "active": True,
    }
    db.collection("students").document(student_id).set(doc)
    print(f"Wrote students/{student_id}.")

    if lecture_id is not None:
        from google.cloud.firestore import ArrayUnion
        lec_ref = db.collection("lectures").document(lecture_id)
        snap = lec_ref.get()
        if not snap.exists:
            # Create a minimal scheduled lecture so capture_app can find it.
            lec_ref.set({
                "lecture_id": lecture_id,
                "title": f"Test Lecture {lecture_id}",
                "doctor_id": "doc_test",
                "date": datetime.now(timezone.utc),
                "subject": "Test",
                "status": "scheduled",
                "enrolled_student_ids": [student_id],
            })
            print(f"Created new lecture {lecture_id} (status=scheduled) with {student_id} enrolled.")
        else:
            lec_ref.update({
                "enrolled_student_ids": ArrayUnion([student_id]),
            })
            print(f"Added {student_id} to lectures/{lecture_id}.enrolled_student_ids.")

    print(f"Done. {student_id} is ready for recognition by capture_app.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
