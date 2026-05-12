// Student-identity enrollment for the browser capture pipeline.
//
// Each student in Firestore can carry an optional `face_encoding_web` array
// (128 floats from face-api.js's FaceRecognitionNet) used to match a face
// in the camera against the right student_id. dlib's `face_encoding` from
// the Python app is in a different embedding space — incompatible.
//
// On first capture for a lecture, we walk the enrolled_student_ids, load
// each face_photo_url, compute a fresh `face_encoding_web` and patch the
// student doc. Subsequent captures hit the cache instantly.

import {
  collection, doc, getDoc, updateDoc, getDocs, query, where, documentId,
} from "firebase/firestore";
import { db } from "../../firebase";
import { faceapi, detectorOptions } from "./faceapi-loader";

// In-memory cache keyed by student_id so we don't re-compute embeddings
// every time the capture page mounts within a session.
const _cache = new Map();

// Load (and lazily compute) embeddings for the given student ids.
// Returns a LabeledFaceDescriptors array suitable for FaceMatcher.
export async function loadEnrolledEmbeddings(studentIds, { onProgress } = {}) {
  if (!studentIds?.length) return [];
  const ids = Array.from(new Set(studentIds.filter(Boolean)));

  // 1. Hit the in-memory cache first.
  const labeled = [];
  const missing = [];
  for (const sid of ids) {
    if (_cache.has(sid)) {
      labeled.push(_cache.get(sid));
    } else {
      missing.push(sid);
    }
  }

  if (!missing.length) return labeled;

  // 2. Fetch the student docs.
  // (Firestore allows `in` queries of up to 30 ids — chunk if needed)
  const docs = [];
  for (let i = 0; i < missing.length; i += 30) {
    const chunk = missing.slice(i, i + 30);
    const snap = await getDocs(
      query(collection(db, "students"), where(documentId(), "in", chunk))
    );
    docs.push(...snap.docs);
  }

  const total = docs.length;
  let done = 0;

  // Process students in parallel with a concurrency limit. Without this we
  // go ~1.5 s per student × 100 = 2-3 minutes. With concurrency=4 it drops
  // to ~30-45 s for a fresh enrollment of 100 photos.
  const CONCURRENCY = 4;
  const queue = docs.slice();

  async function worker() {
    while (queue.length) {
      const d = queue.shift();
      if (!d) return;
      const sid = d.id;
      const data = d.data() || {};
      let descriptor = null;

      if (Array.isArray(data.face_encoding_web) && data.face_encoding_web.length === 128) {
        descriptor = new Float32Array(data.face_encoding_web);
      } else if (data.face_photo_url) {
        try {
          descriptor = await computeFromPhoto(data.face_photo_url);
          if (descriptor) {
            await updateDoc(doc(db, "students", sid), {
              face_encoding_web: Array.from(descriptor),
            }).catch((e) => console.warn(`[enrollment] couldn't cache ${sid}: ${e.message}`));
          } else {
            console.warn(`[enrollment] ${sid}: no face found in photo`);
          }
        } catch (e) {
          console.warn(`[enrollment] ${sid}: ${e.message}`);
        }
      }

      done++;
      onProgress?.({ done, total, sid, ok: !!descriptor });

      if (descriptor) {
        const ld = new faceapi.LabeledFaceDescriptors(sid, [descriptor]);
        _cache.set(sid, ld);
        labeled.push(ld);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return labeled;
}

// Load an image URL → run face-api detection → return its 128-D descriptor.
// (Used for enrollment only — not on the hot frame loop.)
async function computeFromPhoto(url) {
  // CORS: Firebase Storage emulator + cloud both serve with
  // Access-Control-Allow-Origin: * for public-read URLs. Add crossOrigin
  // so the <img> can be drawn to a canvas if face-api needs it.
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("photo load failed"));
  });
  const det = await faceapi
    .detectSingleFace(img, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();
  return det?.descriptor ?? null;
}

// Convenience: turn a labeled set into a matcher with a sensible threshold.
// 0.55 is tight (very few false matches); 0.6 is permissive. dlib paper
// uses 0.6; face-api docs suggest 0.5-0.6 for photos.
export function buildMatcher(labeled, distanceThreshold = 0.55) {
  if (!labeled.length) return null;
  return new faceapi.FaceMatcher(labeled, distanceThreshold);
}

// Wipe the cached descriptors for these student ids — both the in-memory
// cache AND the Firestore `face_encoding_web` field — so the next call to
// loadEnrolledEmbeddings recomputes from the photos. Useful when the
// descriptors got out of sync with the photos (re-enrollment).
export async function resetEmbeddings(studentIds) {
  if (!studentIds?.length) return 0;
  let cleared = 0;
  for (const sid of studentIds) {
    _cache.delete(sid);
    try {
      await updateDoc(doc(db, "students", sid), { face_encoding_web: null });
      cleared++;
    } catch (e) {
      console.warn(`[enrollment] couldn't reset ${sid}: ${e.message}`);
    }
  }
  return cleared;
}
