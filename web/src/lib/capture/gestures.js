// Classify a MediaPipe HandLandmarker hand (21 normalized 3-D landmarks)
// into the project's gesture vocabulary:
//
//   hand_raised     — wrist is above the face top edge
//   thumbs_up       — only thumb extended, pointing up
//   thumbs_down     — only thumb extended, pointing down
//   pointing        — only index finger extended
//   toilet_request  — closed fist (all fingers curled, including thumb)
//   none            — anything else
//
// Mirrors the rules in classroom-app-python/gesture_detector.py closely
// enough that the Live Classroom + Shiny dashboard see consistent labels.

const LM = {
  WRIST: 0,
  THUMB: { CMC: 1, MCP: 2, IP: 3, TIP: 4 },
  INDEX: { MCP: 5, PIP: 6, DIP: 7, TIP: 8 },
  MIDDLE:{ MCP: 9, PIP: 10, DIP: 11, TIP: 12 },
  RING:  { MCP: 13, PIP: 14, DIP: 15, TIP: 16 },
  PINKY: { MCP: 17, PIP: 18, DIP: 19, TIP: 20 },
};

function isFingerExtended(lm, tipIdx, pipIdx, mcpIdx) {
  const tip = lm[tipIdx], pip = lm[pipIdx], mcp = lm[mcpIdx];
  if (!tip || !pip || !mcp) return false;
  // Tip is further from MCP than PIP is when the finger is extended.
  const dTip = Math.hypot(tip.x - mcp.x, tip.y - mcp.y);
  const dPip = Math.hypot(pip.x - mcp.x, pip.y - mcp.y);
  return dTip > dPip * 1.45;
}

function thumbExtended(lm) {
  // Thumb uses a separate rule because it bends sideways. Tip should be
  // noticeably further from the wrist than the MCP is.
  const wrist = lm[LM.WRIST], tip = lm[LM.THUMB.TIP], mcp = lm[LM.THUMB.MCP];
  if (!wrist || !tip || !mcp) return false;
  const dTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
  const dMcp = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
  return dTip > dMcp * 1.35;
}

// Classify one hand. `faceTopNorm` is the face bounding box's top edge in
// the same normalized 0..1 coordinate space as the hand landmarks
// (i.e. faceTopPixels / videoHeight). null if no associated face.
export function classifyHandGesture(landmarks, faceTopNorm = null) {
  if (!Array.isArray(landmarks) || landmarks.length !== 21) return "none";

  const wrist  = landmarks[LM.WRIST];
  const idx    = isFingerExtended(landmarks, LM.INDEX.TIP,  LM.INDEX.PIP,  LM.INDEX.MCP);
  const mid    = isFingerExtended(landmarks, LM.MIDDLE.TIP, LM.MIDDLE.PIP, LM.MIDDLE.MCP);
  const ring   = isFingerExtended(landmarks, LM.RING.TIP,   LM.RING.PIP,   LM.RING.MCP);
  const pinky  = isFingerExtended(landmarks, LM.PINKY.TIP,  LM.PINKY.PIP,  LM.PINKY.MCP);
  const thumb  = thumbExtended(landmarks);
  const tipY   = landmarks[LM.THUMB.TIP]?.y ?? wrist.y;
  const fingersUp = [idx, mid, ring, pinky].filter(Boolean).length;

  // hand_raised — wrist is above the associated face's top edge.
  // Beats the other rules even if a finger pattern matches; raising your
  // hand is the most important signal for the doctor.
  if (faceTopNorm != null && wrist.y < faceTopNorm - 0.02 && fingersUp >= 3) {
    return "hand_raised";
  }

  // thumbs_up / down — only thumb extended.
  if (thumb && fingersUp === 0) {
    return tipY < wrist.y ? "thumbs_up" : "thumbs_down";
  }

  // pointing — only index extended.
  if (idx && !mid && !ring && !pinky) return "pointing";

  // toilet_request — closed fist (all fingers + thumb curled).
  if (!thumb && fingersUp === 0) return "toilet_request";

  return "none";
}

// Helper: associate each detected hand with the nearest face by wrist
// proximity in pixel space. Returns a map { trackKey -> gesture } for the
// hands that landed inside (or very close to) a face's region.
export function attachGesturesToFaces({
  handResult,                   // MediaPipe result: { landmarks: hand[][] }
  faceResults,                  // face-api results with _trackKey set
  videoW, videoH,
}) {
  const out = {};
  if (!handResult?.landmarks?.length || !faceResults?.length) return out;
  const hands = handResult.landmarks;

  for (const hand of hands) {
    if (!hand?.length) continue;
    const wrist = hand[LM.WRIST];
    const px = wrist.x * videoW;
    const py = wrist.y * videoH;

    let nearest = null, minDist = Infinity;
    for (const f of faceResults) {
      const b = f.detection.box;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const d = Math.hypot(px - cx, py - cy);
      if (d < minDist) { minDist = d; nearest = f; }
    }
    if (!nearest) continue;
    const faceBox = nearest.detection.box;
    // Reasonable proximity = within ~2x face width
    if (minDist > faceBox.width * 2.0) continue;

    const faceTopNorm = faceBox.y / videoH;
    const g = classifyHandGesture(hand, faceTopNorm);
    if (g !== "none") {
      // If this face already has a "hand_raised" from another hand, keep it.
      const prev = out[nearest._trackKey];
      if (prev !== "hand_raised") out[nearest._trackKey] = g;
    }
  }
  return out;
}
