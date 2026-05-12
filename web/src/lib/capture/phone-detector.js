// Phone-in-frame detection via TensorFlow.js COCO-SSD.
//
// COCO-SSD is a lightweight MobileNet-based detector with 90 classes —
// we only care about class "cell phone". Mirrors the YOLOv8n approach in
// classroom-app-python/phone_detector.py but uses TFJS so it runs in the
// browser. Lazy-loaded on first use.

let _model = null;
let _loading = null;

export async function ensurePhoneDetector() {
  if (_model) return _model;
  if (_loading) return _loading;
  _loading = (async () => {
    const tf = await import("@tensorflow/tfjs");
    // Prefer WebGL for speed.
    try { await tf.setBackend("webgl"); } catch { /* fall through */ }
    await tf.ready();
    const cocoSsd = await import("@tensorflow-models/coco-ssd");
    _model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
    console.log("[capture] COCO-SSD phone detector loaded (backend:", tf.getBackend(), ")");
    return _model;
  })();
  return _loading;
}

// Detect phones in a video frame. Returns an array of:
//   { box: {x,y,width,height}, score: 0..1 }
// in pixel coordinates of the video element.
export async function detectPhones(video) {
  if (!_model || !video) return [];
  try {
    const preds = await _model.detect(video, 6, 0.5);  // max 6 hits, min 0.5
    return preds
      .filter((p) => p.class === "cell phone")
      .map((p) => ({
        box: { x: p.bbox[0], y: p.bbox[1], width: p.bbox[2], height: p.bbox[3] },
        score: p.score,
      }));
  } catch (e) {
    console.warn("[capture] phone detect failed:", e?.message);
    return [];
  }
}

// Associate phones with faces by box proximity (center-to-center distance,
// normalized by face width). A phone within ~1.5x face width of a face is
// considered "on phone" for that student.
//
// Returns a Map { trackKey -> { on_phone: bool, cheat_score: 0..100,
//                                phone_box: {...} } }
export function attachPhonesToFaces({ phones, faceResults }) {
  const out = {};
  if (!phones?.length || !faceResults?.length) return out;
  for (const r of faceResults) {
    const fb = r.detection.box;
    const fcx = fb.x + fb.width / 2;
    const fcy = fb.y + fb.height / 2;
    let bestPhone = null, bestDist = Infinity;
    for (const ph of phones) {
      const pcx = ph.box.x + ph.box.width / 2;
      const pcy = ph.box.y + ph.box.height / 2;
      const d = Math.hypot(pcx - fcx, pcy - fcy);
      if (d < bestDist) { bestDist = d; bestPhone = ph; }
    }
    if (bestPhone) {
      const proximity = bestDist / Math.max(1, fb.width);
      // proximity ≤ 1.5 face-widths → flag as on_phone
      const on_phone = proximity <= 1.8;
      if (on_phone) {
        out[r._trackKey] = {
          on_phone: true,
          phone_box: bestPhone.box,
          phone_score: bestPhone.score,
          // cheat_score mirrors the Python heuristic: base 10 + 55 on_phone.
          // Sleep / attention modifiers are layered on at the engagement
          // step in DoctorCapture (so we keep the components separable).
          cheat_score_phone: 55,
        };
      }
    }
  }
  return out;
}
