// Generates synthetic emotion observations against the Firestore emulator so
// the Shiny dashboard has something to render. Picks a handful of lectures
// and a handful of students, then writes ~observations_per_lecture rows per
// lecture, spread over a 30-minute window starting at the lecture's
// scheduled_at (or now if missing).
//
// Usage:
//   node scripts/seed-emotions.mjs               # default: 20 lectures × 60 obs
//   LECTURES=40 OBS=80 node scripts/seed-emotions.mjs

const PROJECT = process.env.FIREBASE_PROJECT_ID || "emotion-detection-dev";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

const NUM_LECTURES = Number(process.env.LECTURES || 20);
const OBS_PER_LECTURE = Number(process.env.OBS || 60);
const STUDENTS_PER_LECTURE = Number(process.env.STUDENTS || 8);

// Behavioural labels — same vocabulary the capture pipeline writes.
const EMOTIONS = ["neutral", "happy", "surprised", "sad", "angry", "fearful", "disgusted"];
const EMOTION_WEIGHTS = [0.45, 0.20, 0.10, 0.10, 0.06, 0.05, 0.04];

const GESTURES = ["none", "hand_raised", "head_nod", "head_shake", "writing"];
const GESTURE_WEIGHTS = [0.78, 0.08, 0.07, 0.03, 0.04];

const SLEEP_REASONS = ["head_down", "eyes_closed", "both"];

function pickWeighted(items, weights) {
  const r = Math.random(); let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (r <= acc) return items[i];
  }
  return items[items.length - 1];
}
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rnd(min, max) { return Math.random() * (max - min) + min; }
function shuffle(a) { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; }

function decode(field) {
  if (!field) return undefined;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.nullValue !== undefined) return null;
  if (field.arrayValue) return (field.arrayValue.values || []).map(decode);
  return undefined;
}
function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  throw new Error(`encode: ${v}`);
}
function fields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = encode(v);
  return out;
}

async function listAll(collection) {
  const r = await fetch(`${FS}:runQuery`, {
    method: "POST", headers: H,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }] } }),
  });
  if (!r.ok) return [];
  const arr = await r.json();
  return (arr || []).filter((x) => x.document).map((x) => {
    const id = x.document.name.split("/").pop();
    const data = {};
    for (const [k, v] of Object.entries(x.document.fields || {})) data[k] = decode(v);
    return { id, ...data };
  });
}

async function fsCreate(collection, data) {
  const r = await fetch(`${FS}/${collection}`, {
    method: "POST", headers: H, body: JSON.stringify({ fields: fields(data) }),
  });
  if (!r.ok) throw new Error(`create ${collection}: ${r.status} ${await r.text()}`);
}

// Lecturer "personality" — mean engagement varies per doctor so clustering shows clusters.
function personalityFor(doctorId) {
  // Stable hash → bias in [-0.15, +0.15] around 0.55 base.
  let h = 0;
  for (const c of doctorId || "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bias = ((h % 1000) / 1000 - 0.5) * 0.3;
  return { baseEngagement: 0.55 + bias, sleepBias: bias < 0 ? 0.08 : 0.02 };
}

async function main() {
  console.log(`[seed-emotions] project=${PROJECT}`);

  const [lectures, students] = await Promise.all([listAll("lectures"), listAll("students")]);
  if (lectures.length === 0 || students.length === 0) {
    console.error("Need lectures and students in Firestore first.");
    process.exit(1);
  }
  console.log(`  lectures available=${lectures.length}  students available=${students.length}`);

  // Already have emotions? warn but proceed (we append rather than wipe).
  const existing = await listAll("emotions");
  if (existing.length > 0) {
    console.log(`  emotions already present (${existing.length}); appending anyway.`);
  }

  const chosenLectures = shuffle(lectures).slice(0, Math.min(NUM_LECTURES, lectures.length));
  console.log(`  generating ${OBS_PER_LECTURE} obs each for ${chosenLectures.length} lecture(s)`);

  let total = 0;
  for (const lec of chosenLectures) {
    const personality = personalityFor(lec.doctor_id || lec.id);
    const start = lec.scheduled_at ? new Date(lec.scheduled_at) : new Date();
    const enrolled = shuffle(students).slice(0, Math.min(STUDENTS_PER_LECTURE, students.length));

    for (let i = 0; i < OBS_PER_LECTURE; i++) {
      const student = enrolled[i % enrolled.length];
      // 30-second buckets across a 30-minute window
      const t = new Date(start.getTime() + (i * 30 * 1000) / Math.max(1, OBS_PER_LECTURE / 60));
      const sleeping = Math.random() < personality.sleepBias;
      const engagement = sleeping
        ? rnd(0, 0.2)
        : Math.max(0, Math.min(1, personality.baseEngagement + rnd(-0.2, 0.2)));
      const emotion = sleeping ? "neutral" : pickWeighted(EMOTIONS, EMOTION_WEIGHTS);
      const gesture = sleeping ? "none" : pickWeighted(GESTURES, GESTURE_WEIGHTS);
      const obs = {
        lecture_id: lec.id,
        student_id: student.id,
        timestamp: t.toISOString(),
        emotion,
        state: sleeping ? "sleeping" : "awake",
        sleep_reason: sleeping ? SLEEP_REASONS[rndInt(0, 2)] : "",
        gesture,
        engagement_score: Number(engagement.toFixed(3)),
        confidence: Number(rnd(0.65, 0.99).toFixed(3)),
      };
      await fsCreate("emotions", obs);
      total += 1;
    }
    process.stdout.write(`  +${OBS_PER_LECTURE} (${total} total)\r`);
  }

  console.log(`\n[seed-emotions] done. wrote ${total} observations across ${chosenLectures.length} lectures.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
