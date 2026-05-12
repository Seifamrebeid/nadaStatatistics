// face-api.js loader. Lazy-loads model weights from a CDN the first time
// the capture page mounts, so the rest of the web app stays light.

import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

let loadingPromise = null;

// Phase 2 models:
//   tinyFaceDetector    → bounding boxes
//   faceLandmark68Net   → 68-point landmarks (eyes/mouth/jaw → EAR, MAR, head pose)
//   faceExpressionNet   → 7-emotion classifier
//   faceRecognitionNet  → 128-D embedding for identification
export function ensureModelsLoaded() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    console.log("[capture] face-api models loaded (incl. recognition)");
  })();
  return loadingPromise;
}

export const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 416,
  // 0.3 catches faces in dim/oblique conditions; was 0.45 which missed
  // faces under typical room lighting. False positives are rare on
  // TinyFaceDetector even at 0.3.
  scoreThreshold: 0.3,
});

export { faceapi };
