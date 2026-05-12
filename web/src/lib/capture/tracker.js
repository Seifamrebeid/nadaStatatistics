// Simple IoU-based face tracker.
//
// Each frame's detected faces are matched to the previous frame's tracks
// by Intersection-over-Union of their bounding boxes. If IoU > threshold
// (default 0.3), it's the same person; otherwise a new track id is minted.
//
// This is cheap (no Kalman, no Hungarian) but plenty for ~5-20 face scenes
// at 30 fps where boxes don't jump much frame-to-frame.

function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width,  b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const ua = a.width * a.height + b.width * b.height - inter;
  return ua > 0 ? inter / ua : 0;
}

export class FaceTracker {
  constructor({ iouThreshold = 0.3, maxAgeFrames = 12 } = {}) {
    this.threshold = iouThreshold;
    this.maxAge    = maxAgeFrames;
    this.tracks    = [];     // [{ id, box, age, label, lastSeenAt }]
    this.nextId    = 1;
  }

  // Update with the current frame's detections. Mutates each detection to
  // add a `_trackKey` property. Returns the array unchanged for chaining.
  update(detections) {
    const used = new Set();
    const now  = performance.now();
    const matched = detections.map((d) => {
      const box = d.detection.box;
      // Find the best-IoU existing track that hasn't been claimed yet.
      let best = -1, bestIoU = this.threshold;
      for (let i = 0; i < this.tracks.length; i++) {
        if (used.has(i)) continue;
        const v = iou(box, this.tracks[i].box);
        if (v > bestIoU) { bestIoU = v; best = i; }
      }
      if (best >= 0) {
        used.add(best);
        this.tracks[best].box = box;
        this.tracks[best].age = 0;
        this.tracks[best].lastSeenAt = now;
        d._trackKey = this.tracks[best].id;
        return d;
      }
      // New track
      const id = `t${this.nextId++}`;
      this.tracks.push({ id, box, age: 0, lastSeenAt: now });
      used.add(this.tracks.length - 1);
      d._trackKey = id;
      return d;
    });

    // Age out unmatched tracks
    for (let i = 0; i < this.tracks.length; i++) {
      if (!used.has(i)) this.tracks[i].age++;
    }
    this.tracks = this.tracks.filter((t) => t.age <= this.maxAge);
    return matched;
  }

  // After matching, optionally store an identity label (student_id) on a
  // track so we don't re-identify it on every frame.
  setLabel(trackKey, label) {
    const t = this.tracks.find((x) => x.id === trackKey);
    if (t) t.label = label;
  }

  getLabel(trackKey) {
    return this.tracks.find((x) => x.id === trackKey)?.label ?? null;
  }
}
