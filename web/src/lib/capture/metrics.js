// Per-frame metrics computed from face-api 68-point landmarks.
//
// Mirrors classroom-app-python/{sleep_detector,yawn_detector,attention_detector}.py
// closely enough that the same downstream consumers (LiveClassroom monitor,
// R Shiny dashboard) see the same shape of data.
//
// All helpers are pure functions; the StateHistory class holds the rolling
// per-track buffers used for temporal smoothing.

// All thresholds tuned conservatively — we'd rather miss a real sleep than
// flag an awake student as sleeping. False positives erode doctor trust.
const EAR_CLOSED_THRESHOLD     = 0.19;   // tighter — eyes have to be very closed
const EAR_CLOSED_FRAMES        = 8;      // ~270 ms at 30 fps
const HEAD_DOWN_PITCH          = -28;    // larger angle required (was -18 — fired on slight head tilt)
const HEAD_DOWN_FRAMES         = 12;     // sustained ~400 ms
const MAR_OPEN_THRESHOLD       = 0.6;
const MAR_OPEN_FRAMES          = 12;     // long-yawn only, no random talk

// ─────────────────────────────────────────────────────────────────────
// Geometry
function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Eye Aspect Ratio (Soukupová & Čech 2016) on a 6-point eye contour.
// face-api landmarks 36–41 (left) / 42–47 (right) — use getLeftEye()/getRightEye().
function eyeAspectRatio(eye) {
  if (!eye || eye.length !== 6) return null;
  const A = dist(eye[1], eye[5]);
  const B = dist(eye[2], eye[4]);
  const C = dist(eye[0], eye[3]);
  return (A + B) / (2 * C);
}

// Mouth Aspect Ratio — vertical opening / horizontal width.
// face-api mouth landmarks (20 pts). Use the outer contour 48–67; for MAR
// we just need vertical 51↔57 and horizontal 48↔54.
function mouthAspectRatio(mouth) {
  if (!mouth || mouth.length < 20) return null;
  // getMouth() returns 20 points in face-api ordering:
  // outer:  0..11 (corresponds to dlib 48..59)
  // inner:  12..19 (corresponds to dlib 60..67)
  // We want vertical opening = midpoint of upper inner to midpoint of lower
  // inner. For simplicity & robustness, use outer top (idx 3 = dlib 51)
  // to outer bottom (idx 9 = dlib 57), horizontal left-right (idx 0..6).
  const vert  = dist(mouth[3], mouth[9]);
  const horiz = dist(mouth[0], mouth[6]);
  if (horiz < 1) return null;
  return vert / horiz;
}

// Crude head-pitch estimate from the nose-bridge & chin landmarks. Returns
// degrees: positive = looking up, negative = looking down. Not as accurate
// as a true PnP solve but cheap and adequate for "head down" detection.
function headPitchDeg(landmarks) {
  if (!landmarks) return null;
  // nose bridge 27..30 (face-api zero-indexed: same)
  const noseTop    = landmarks[27];
  const noseTip    = landmarks[30];
  const chin       = landmarks[8];
  if (!noseTop || !noseTip || !chin) return null;
  // Vertical reference: top of bounding box to chin.
  // pitch ≈ atan2(noseTipY - midY, noseTipX - midX)
  // Simpler proxy: ratio of (chinY - noseTipY) to (noseTipY - noseTopY).
  // When head tilts down, the chin drops relative to the bridge.
  const upper = noseTip.y - noseTop.y;
  const lower = chin.y    - noseTip.y;
  if (upper < 1) return 0;
  const ratio = lower / upper;
  // ratio ~ 1.6 when neutral; > 2.0 when head down; < 1.3 when head up.
  // Convert to a degree-like scale: pitch = (1.6 - ratio) * 30
  return (1.6 - ratio) * 30;
}

// ─────────────────────────────────────────────────────────────────────
// Per-track temporal state.
// Pass `trackKey` so unrelated faces don't pollute each other.
export class TrackStateBuffer {
  constructor() {
    this.byKey = new Map();   // trackKey -> { earBelow, pitchDown, marOpen, ... }
  }
  get(key) {
    if (!this.byKey.has(key)) {
      this.byKey.set(key, {
        earBelow: 0,
        pitchDown: 0,
        marOpen:  0,
        lastSeen: performance.now(),
      });
    }
    return this.byKey.get(key);
  }
  // Forget tracks that haven't been touched in N seconds.
  prune(maxAgeMs = 5000) {
    const now = performance.now();
    for (const [k, v] of this.byKey) {
      if (now - v.lastSeen > maxAgeMs) this.byKey.delete(k);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Classifier — returns the per-observation enrichment for one face.
//
//   trackKey   : stable per-track id (e.g. our IoU tracker's id)
//   landmarks  : face-api 68-point landmark list (FaceLandmarks68)
//   buffer     : a TrackStateBuffer instance (shared across the loop)
//
// Output mirrors the Python emotions schema:
//   { state, sleep_reason, yawning, yawn_reason, ear, mar, head_pitch }
export function classifyFrame(trackKey, landmarks, buffer) {
  const s = buffer.get(trackKey);
  s.lastSeen = performance.now();

  if (!landmarks) {
    return { state: "awake", sleep_reason: null, yawning: false, yawn_reason: null,
             ear: null, mar: null, head_pitch: null };
  }

  const leftEye  = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const mouth    = landmarks.getMouth();
  const positions = landmarks.positions;

  const earL = eyeAspectRatio(leftEye);
  const earR = eyeAspectRatio(rightEye);
  const ear  = (earL != null && earR != null) ? (earL + earR) / 2 : (earL ?? earR);
  const mar  = mouthAspectRatio(mouth);
  const pitch = headPitchDeg(positions);

  // Eye closure streak
  if (ear != null && ear < EAR_CLOSED_THRESHOLD) s.earBelow++;
  else                                            s.earBelow = 0;

  // Head down streak
  if (pitch != null && pitch < HEAD_DOWN_PITCH) s.pitchDown++;
  else                                          s.pitchDown = 0;

  // Mouth open streak (for yawn)
  if (mar != null && mar > MAR_OPEN_THRESHOLD) s.marOpen++;
  else                                          s.marOpen = 0;

  const eyesClosed = s.earBelow >= EAR_CLOSED_FRAMES;
  const headDown   = s.pitchDown >= HEAD_DOWN_FRAMES;
  let state = "awake", sleep_reason = null;
  if (eyesClosed && headDown) { state = "sleeping"; sleep_reason = "both"; }
  else if (eyesClosed)        { state = "sleeping"; sleep_reason = "eyes_closed"; }
  else if (headDown)          { state = "sleeping"; sleep_reason = "head_down"; }

  const yawning = s.marOpen >= MAR_OPEN_FRAMES;
  const yawn_reason = yawning ? "mouth_open" : null;

  return {
    state, sleep_reason, yawning, yawn_reason,
    ear: ear  != null ? Math.round(ear  * 1000) / 1000 : null,
    mar: mar  != null ? Math.round(mar  * 1000) / 1000 : null,
    head_pitch: pitch != null ? Math.round(pitch * 10) / 10 : null,
  };
}
