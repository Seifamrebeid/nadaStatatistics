// MediaPipe HandLandmarker loader.
//
// Lazy-initialized on the capture page mount. The WASM bundle and the
// .task model file come from Google's public CDN — no local hosting.

let _handLandmarker = null;
let _loading = null;

export async function ensureHandLandmarker() {
  if (_handLandmarker) return _handLandmarker;
  if (_loading) return _loading;
  _loading = (async () => {
    const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    _handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      numHands: 4,
      runningMode: "VIDEO",
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    console.log("[capture] MediaPipe HandLandmarker loaded");
    return _handLandmarker;
  })();
  return _loading;
}

// Convenience: detect on a video element. Returns the MediaPipe result object:
// { landmarks: HandLandmark[][], handedness: Category[][], worldLandmarks: ... }
export function detectHandsForVideo(video, timestampMs) {
  if (!_handLandmarker || !video) return null;
  try {
    return _handLandmarker.detectForVideo(video, timestampMs);
  } catch (e) {
    console.warn("[capture] hand detect failed:", e?.message);
    return null;
  }
}
