// Seed realistic fake `emotions` + `attendance` rows for existing students
// against existing lectures in the Firestore emulator.
//
// Run AFTER you have students + lectures in the emulator.
//
//   node scripts/seed-fake-engagement.mjs
//
// Defaults:
//   - target every active student
//   - per student, attend 60% of lectures
//   - per (student, lecture) attended, ~25 emotion observations spaced across
//     the lecture window
//   - distribution biased toward happy / neutral with occasional sleeping
//     bursts and gestures, matching what the Python capture app would write
//
// Override via env vars:
//   STUDENT_LIMIT=20            # only first N students
//   LECTURES_PER_STUDENT=5      # cap per-student lecture attendance
//   OBS_PER_LECTURE=25          # observations per (student, lecture) pair
//   PROJECT=fridgechef-jt50c

const PROJECT = process.env.PROJECT || process.env.FIREBASE_PROJECT_ID || "fridgechef-jt50c";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const H  = { Authorization: "Bearer owner", "Content-Type": "application/json" };

const STUDENT_LIMIT       = parseInt(process.env.STUDENT_LIMIT || "0", 10);
const LECTURES_PER_STUDENT = parseInt(process.env.LECTURES_PER_STUDENT || "8", 10);
const OBS_PER_LECTURE     = parseInt(process.env.OBS_PER_LECTURE || "25", 10);
const ATTEND_RATE         = parseFloat(process.env.ATTEND_RATE || "0.7");

// ── Firestore typed-value encoder ───────────────────────────────────────
function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "string") {
    // Auto-detect ISO timestamps so they get the right Firestore type.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return { timestampValue: v };
    return { stringValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = encode(val);
    return { mapValue: { fields } };
  }
  throw new Error(`unsupported value: ${v}`);
}
const fields = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = encode(v);
  return out;
};
const decode = (f) => {
  if (!f) return null;
  if (f.nullValue !== undefined)      return null;
  if (f.stringValue !== undefined)    return f.stringValue;
  if (f.booleanValue !== undefined)   return f.booleanValue;
  if (f.integerValue !== undefined)   return Number(f.integerValue);
  if (f.doubleValue !== undefined)    return Number(f.doubleValue);
  if (f.timestampValue !== undefined) return f.timestampValue;
  if (f.arrayValue)                   return (f.arrayValue.values || []).map(decode);
  if (f.mapValue) {
    const o = {};
    for (const [k, v] of Object.entries(f.mapValue.fields || {})) o[k] = decode(v);
    return o;
  }
  return null;
};

// ── REST helpers ────────────────────────────────────────────────────────
async function listAll(coll) {
  const out = [];
  let token = null;
  while (true) {
    const url = new URL(`${FS}/${coll}`);
    url.searchParams.set("pageSize", "300");
    if (token) url.searchParams.set("pageToken", token);
    const r = await fetch(url, { headers: H });
    if (!r.ok) throw new Error(`listAll(${coll}) HTTP ${r.status}: ${await r.text()}`);
    const j = await r.json();
    for (const d of j.documents || []) {
      const id = d.name.split("/").pop();
      const flat = {};
      for (const [k, v] of Object.entries(d.fields || {})) flat[k] = decode(v);
      flat._id = id;
      out.push(flat);
    }
    token = j.nextPageToken;
    if (!token) break;
  }
  return out;
}

async function createDoc(coll, fieldsObj) {
  const r = await fetch(`${FS}/${coll}`, {
    method: "POST", headers: H, body: JSON.stringify({ fields: fieldsObj })
  });
  if (!r.ok) throw new Error(`createDoc(${coll}) HTTP ${r.status}: ${await r.text()}`);
}

async function createDocAt(coll, id, fieldsObj) {
  const r = await fetch(`${FS}/${coll}?documentId=${encodeURIComponent(id)}`, {
    method: "POST", headers: H, body: JSON.stringify({ fields: fieldsObj })
  });
  if (!r.ok) throw new Error(`createDocAt(${coll}/${id}) HTTP ${r.status}: ${await r.text()}`);
}

// ── Random helpers ──────────────────────────────────────────────────────
const rand = () => Math.random();
const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];
const sample = (arr, n) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};
const weightedChoice = (table) => {
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [k, w] of Object.entries(table)) { if ((r -= w) <= 0) return k; }
  return Object.keys(table)[0];
};

// ── Engagement scoring (mirrors R + Python) ─────────────────────────────
const EMOTION_TO_ENGAGEMENT = {
  happy: 0.9, surprise: 0.8, neutral: 0.6,
  sad: 0.3, angry: 0.2, fear: 0.2, disgust: 0.1
};
function engagementScore(emotion, state, gesture) {
  if (state === "sleeping") return 0.0;
  let base = EMOTION_TO_ENGAGEMENT[emotion] ?? 0;
  if (gesture === "hand_raised") base = Math.min(1.0, base + 0.2);
  return Math.round(base * 1000) / 1000;
}

// ── Per-student "personality" — drives realistic per-student variation ──
function personalityFor(studentId) {
  // Seed from id so the same student gets the same personality each run
  let h = 0;
  for (const c of studentId) h = (h * 31 + c.charCodeAt(0)) | 0;
  const rng = () => { h = (h * 9301 + 49297) % 233280; return h / 233280; };
  const profile = rng();
  if (profile < 0.2) {
    // engaged star: lots of happy, hand raises, low sleep
    return {
      emotionDist: { happy: 5, surprise: 2, neutral: 4, sad: 0.5, angry: 0.3, fear: 0.2, disgust: 0.1 },
      sleepProb: 0.02, handRaisedProb: 0.18, yawnProb: 0.04
    };
  } else if (profile < 0.5) {
    // average
    return {
      emotionDist: { happy: 2, surprise: 1, neutral: 5, sad: 1, angry: 0.5, fear: 0.3, disgust: 0.2 },
      sleepProb: 0.07, handRaisedProb: 0.05, yawnProb: 0.07
    };
  } else if (profile < 0.85) {
    // bored / disengaged
    return {
      emotionDist: { happy: 0.5, surprise: 0.5, neutral: 4, sad: 2, angry: 1.5, fear: 0.5, disgust: 0.5 },
      sleepProb: 0.18, handRaisedProb: 0.02, yawnProb: 0.15
    };
  } else {
    // sleeper
    return {
      emotionDist: { happy: 0.5, surprise: 0.3, neutral: 3, sad: 2, angry: 1, fear: 0.3, disgust: 0.3 },
      sleepProb: 0.4, handRaisedProb: 0.01, yawnProb: 0.25
    };
  }
}

// Generate one observation row.
function makeObservation({ studentId, lecture, ts, persona }) {
  const emotion = weightedChoice(persona.emotionDist);
  const sleeping = rand() < persona.sleepProb;
  const handRaised = !sleeping && rand() < persona.handRaisedProb;
  const yawning = rand() < persona.yawnProb;

  const state = sleeping ? "sleeping" : "awake";
  const gesture = handRaised
    ? "hand_raised"
    : (rand() < 0.02 ? choice(["thumbs_up","pointing","toilet_request"]) : "none");

  const sleepReason = sleeping
    ? choice(["eyes_closed","head_down","both"])
    : null;
  const yawnReason = yawning
    ? choice(["mouth_open","hand_covered","both"])
    : null;

  return fields({
    student_id:       studentId,
    lecture_id:       lecture._id,
    subject_id:       lecture.subject_id ?? null,
    class_id:         lecture.class_id   ?? null,
    week_id:          lecture.week_id    ?? null,
    timestamp:        ts.toISOString(),
    emotion,
    confidence:       Math.round((0.55 + rand() * 0.4) * 100) / 100,
    state,
    sleep_reason:     sleepReason,
    gesture,
    engagement_score: engagementScore(emotion, state, gesture),
    yawning,
    yawn_reason:      yawnReason,
    attention_score:  Math.round((sleeping ? 0.05 + rand() * 0.2 : 0.5 + rand() * 0.5) * 100) / 100,
    cheat_score:      Math.round(rand() * 0.15 * 100) / 100,
    cheat_warning:    rand() < 0.02
  });
}

// Pick a lecture's start time. If lecture.date is set, use that; otherwise
// space lectures across the past 6 weeks at 09:00 each weekday.
function lectureStart(lecture, fallbackIdx) {
  const d = lecture.date;
  if (d) return new Date(d);
  const base = new Date();
  base.setUTCHours(9, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() - (fallbackIdx + 1) * 2);
  return base;
}

// ── Main ───────────────────────────────────────────────────────────────
const main = async () => {
  console.log(`[seed] target project=${PROJECT}`);
  console.log(`[seed] reading students + lectures…`);
  const students = await listAll("students");
  const lectures = await listAll("lectures");
  console.log(`[seed]   students=${students.length}  lectures=${lectures.length}`);
  if (!students.length || !lectures.length) {
    console.error("[seed] need at least one student and one lecture; aborting.");
    process.exit(1);
  }

  const targets = STUDENT_LIMIT > 0 ? students.slice(0, STUDENT_LIMIT) : students;
  console.log(`[seed] generating engagement for ${targets.length} student(s)`);

  let totalEmo = 0, totalAtt = 0;
  let i = 0;
  for (const s of targets) {
    i++;
    const sid = s._id;
    const persona = personalityFor(sid);
    const numLectures = Math.min(lectures.length,
      Math.max(2, Math.round(LECTURES_PER_STUDENT * (0.5 + rand()))));
    const attend = sample(lectures, numLectures);

    for (let li = 0; li < attend.length; li++) {
      const lec = attend[li];
      const present = rand() < ATTEND_RATE;

      // Attendance row
      await createDoc("attendance", fields({
        student_id: sid,
        lecture_id: lec._id,
        present,
        timestamp:  lectureStart(lec, li).toISOString()
      }));
      totalAtt++;

      if (!present) continue;

      // Emotions across the lecture window (90 min default).
      const start = lectureStart(lec, li);
      const stepMs = (90 * 60 * 1000) / OBS_PER_LECTURE;
      for (let k = 0; k < OBS_PER_LECTURE; k++) {
        const ts = new Date(start.getTime() + k * stepMs +
                            Math.floor((rand() - 0.5) * stepMs * 0.3));
        const obs = makeObservation({ studentId: sid, lecture: lec, ts, persona });
        await createDoc("emotions", obs);
        totalEmo++;
      }
    }
    if (i % 5 === 0) console.log(`  …${i}/${targets.length}  (emo=${totalEmo} att=${totalAtt})`);
  }

  console.log(`[seed] done. inserted emotions=${totalEmo} attendance=${totalAtt}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
