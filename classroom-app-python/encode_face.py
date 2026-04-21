"""CLI: compute a 128-d face encoding from an enrollment photo.

Called by the R Plumber backend via system2() from:
    POST /api/students/<id>/face
    POST /api/doctors/<id>/face

Usage:
    python encode_face.py <image_path>

Contract
--------
- Reads the image from <image_path>.
- Runs face_recognition.face_locations + face_recognition.face_encodings.
- Requires exactly one face. Otherwise prints JSON and exits non-zero:
    {"error": "no_face"}         (no faces detected)
    {"error": "multiple_faces"}  (more than one face detected)
- On success: prints {"encoding": [128 floats]} to stdout, exit code 0.

Must be small and side-effect-free. No Firebase writes, no network calls.
"""

import json
import sys

import face_recognition


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: python encode_face.py <image_path>"}))
        return 2

    image_path = sys.argv[1]
    try:
        image = face_recognition.load_image_file(image_path)
    except (FileNotFoundError, OSError) as e:
        print(json.dumps({"error": "image_read_failed", "detail": str(e)}))
        return 3

    locations = face_recognition.face_locations(image)
    if len(locations) == 0:
        print(json.dumps({"error": "no_face"}))
        return 1
    if len(locations) > 1:
        print(json.dumps({"error": "multiple_faces", "count": len(locations)}))
        return 1

    encodings = face_recognition.face_encodings(image, known_face_locations=locations)
    if len(encodings) == 0:
        print(json.dumps({"error": "no_face"}))
        return 1

    print(json.dumps({"encoding": encodings[0].tolist()}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
