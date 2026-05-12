// Buffered Firestore writer for live emotion observations.
//
// Same shape as classroom-app-python/firebase_writer.py — every observation
// is one document in the `emotions` collection. Buffer is flushed in a
// batched write every `flushIntervalMs` (default 1 s).

import { collection, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";

export class CaptureWriter {
  constructor({ lectureId, flushIntervalMs = 1000, perFaceIntervalMs = 1000 } = {}) {
    this.lectureId = lectureId;
    this.flushIntervalMs = flushIntervalMs;
    this.perFaceIntervalMs = perFaceIntervalMs;
    this.buffer = [];
    this.lastPushAt = new Map();   // student_id -> ms timestamp of last push
    this.timer = null;
    this.stats = { written: 0, failures: 0, lastFlushAt: null, throttled: 0 };
  }

  // Throttled per-student. Without this we push 30 docs/sec/face which
  // floods Firestore's back-channel. The Python app writes at ~1/sec/face;
  // we mirror that here.
  push(obs) {
    if (!obs) return;
    const key = obs.student_id || "?";
    const now = performance.now();
    const last = this.lastPushAt.get(key) || 0;
    if (now - last < this.perFaceIntervalMs) {
      this.stats.throttled++;
      return;
    }
    this.lastPushAt.set(key, now);
    this.buffer.push({
      ...obs,
      lecture_id: this.lectureId,
      timestamp:  new Date().toISOString(),
    });
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { this.flush().catch(()=>{}); }, this.flushIntervalMs);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async flush() {
    if (!this.buffer.length) return 0;
    const rows = this.buffer;
    this.buffer = [];
    try {
      const col = collection(db, "emotions");
      // writeBatch supports up to 500 ops. We send chunks of 400 for safety.
      for (let i = 0; i < rows.length; i += 400) {
        const chunk = rows.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const r of chunk) {
          batch.set(doc(col), r);
        }
        await batch.commit();
      }
      this.stats.written += rows.length;
      this.stats.lastFlushAt = new Date();
      return rows.length;
    } catch (e) {
      this.stats.failures++;
      console.error("[capture] flush failed; re-buffering:", e);
      // Re-queue at the front so we don't drop data
      this.buffer.unshift(...rows);
      throw e;
    }
  }
}
