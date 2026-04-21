"""CLI: match an uploaded login photo against a list of candidate encodings.

Called by the R Plumber backend via system2() from:
    POST /api/auth/face-login

Usage:
    python match_face.py <image_path> <candidates_json_path> [tolerance]

Candidates file format:
    [{"user_id": "stu_042", "encoding": [...128 floats...]}, ...]

Default tolerance is 0.6 (matches FACE_MATCH_TOLERANCE in .env).

Contract
--------
- Encodes the uploaded photo with face_recognition. Fails with:
    {"error": "no_face"}         (no face in the login photo)
    {"error": "multiple_faces"}  (more than one face in the login photo)
- Computes face_recognition.face_distance against every candidate.
- If the minimum distance is below tolerance, prints:
    {"user_id": "<id>", "distance": <float>}
  exit code 0.
- Ambiguous match (top-2 distances within 0.05 of each other) prints:
    {"error": "ambiguous", "best_distance": <float>, "runner_up_distance": <float>}
  exit code 1 — caller rejects and falls back to password.
- Otherwise prints:
    {"error": "no_match", "best_distance": <float>}
  exit code 1.

Must be small and side-effect-free. No Firebase writes, no network calls.
"""

import json
import sys

import face_recognition
import numpy as np

_DEFAULT_TOLERANCE = 0.6
_AMBIGUITY_MARGIN = 0.05


def main() -> int:
    if len(sys.argv) not in (3, 4):
        print(json.dumps({"error": "usage: python match_face.py <image_path> <candidates_json_path> [tolerance]"}))
        return 2

    image_path = sys.argv[1]
    candidates_path = sys.argv[2]
    tolerance = float(sys.argv[3]) if len(sys.argv) == 4 else _DEFAULT_TOLERANCE

    try:
        image = face_recognition.load_image_file(image_path)
    except (FileNotFoundError, OSError) as e:
        print(json.dumps({"error": "image_read_failed", "detail": str(e)}))
        return 3

    try:
        with open(candidates_path, "r", encoding="utf-8") as fh:
            candidates = json.load(fh)
    except (FileNotFoundError, OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": "candidates_read_failed", "detail": str(e)}))
        return 3

    if not candidates:
        print(json.dumps({"error": "no_candidates"}))
        return 1

    locations = face_recognition.face_locations(image)
    if len(locations) == 0:
        print(json.dumps({"error": "no_face"}))
        return 1
    if len(locations) > 1:
        print(json.dumps({"error": "multiple_faces", "count": len(locations)}))
        return 1

    probe = face_recognition.face_encodings(image, known_face_locations=locations)[0]

    known_encodings = np.array([c["encoding"] for c in candidates])
    distances = face_recognition.face_distance(known_encodings, probe)

    order = np.argsort(distances)
    best_idx = int(order[0])
    best_distance = float(distances[best_idx])

    if best_distance >= tolerance:
        print(json.dumps({"error": "no_match", "best_distance": best_distance}))
        return 1

    if len(order) > 1:
        runner_up_distance = float(distances[order[1]])
        if runner_up_distance - best_distance < _AMBIGUITY_MARGIN:
            print(json.dumps({
                "error": "ambiguous",
                "best_distance": best_distance,
                "runner_up_distance": runner_up_distance,
            }))
            return 1

    print(json.dumps({
        "user_id": candidates[best_idx]["user_id"],
        "distance": best_distance,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
