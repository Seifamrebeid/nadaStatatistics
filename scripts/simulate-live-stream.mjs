// Live emotion stream simulator — mimics what the Python classroom app
// writes during a recording lecture. Flushes one obs per student per second
// to Firestore so the web-doctor LiveClassroom view updates in real time.
//
// Usage:
//   node scripts/simulate-live-stream.mjs <lecture_id> [secs] [students]
//
//     lecture_id  — required. Use a lecture currently in status=recording.
//     secs        — total seconds to stream (default 120)
//     students    — how many enrolled students to simulate (default 8)
//
// Stop with Ctrl+C. Cleans up nothing on exit (writes are real).

const PROJECT = process.env.FIREBASE_PROJECT_ID || "fridgechef-jt50c";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const H  = { Authorization: "Bearer owner", "Content-Type": "application/json" };

const lectureId = process.argv[2];
const totalSecs = parseInt(process.argv[3] || "120", 10);
const numStudents = parseInt(process.argv[4] || "8", 10);

if (!lectureId) {
  console.error("usage: simulate-live-stream.mjs <lecture_id> [secs] [students]");
  process.exit(1);
}

// ── encode ──────────────────────────────────────────────────────────────
const encode = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") {
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
};
const fields = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = encode(v);
  return out;
};
const decode = (f) => {
  if (!f) return null;
  if (f.nullValue !== undefined) return null;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return Number(f.doubleValue);
  if (f.timestampValue !== undefined) return f.timestampValue;
  if (f.arrayValue) return (f.arrayValue.values || []).map(decode);
  if (f.mapValue) {
    const o = {};
    for (const [k, v] of Object.entries(f.mapValue.fields || {})) o[k] = decode(v);
    return o;
  }
  return null;
};

async function getDoc(path) {
  const r = await fetch(`${FS}/${path}`, { headers: H });
  if (!r.ok) return null;
  const j = await r.json();
  const out = {}; for (const [k, v] of Object.entries(j.fields || {})) out[k] = decode(v);
  return out;
}
async function listAll(coll) {
  const out = []; let token = null;
  while (true) {
    const url = new URL(`${FS}/${coll}`);
    url.searchParams.set("pageSize", "300");
    if (token) url.searchParams.set("pageToken", token);
    const r = await fetch(url, { headers: H });
    if (!r.ok) throw new Error(`list ${coll} HTTP ${r.status}`);
    const j = await r.json();
    for (const d of j.documents || []) {
      const id = d.name.split("/").pop();
      const flat = {}; for (const [k, v] of Object.entries(d.fields || {})) flat[k] = decode(v);
      flat._id = id; out.push(flat);
    }
    token = j.nextPageToken; if (!token) break;
  }
  return out;
}
async function createDoc(coll, fieldsObj) {
  const r = await fetch(`${FS}/${coll}`, {
    method: "POST", headers: H, body: JSON.stringify({ fields: fieldsObj })
  });
  if (!r.ok) throw new Error(`createDoc(${coll}) HTTP ${r.status}: ${await r.text()}`);
}

// ── engagement logic (mirrors Python) ───────────────────────────────────
const EMOTION = { happy: 0.9, surprise: 0.8, neutral: 0.6,
                  sad: 0.3, angry: 0.2, fear: 0.2, disgust: 0.1 };
const engagementScore = (emotion, state, gesture) => {
  if (state === "sleeping") return 0.0;
  let b = EMOTION[emotion] ?? 0;
  if (gesture === "hand_raised") b = Math.min(1.0, b + 0.2);
  return Math.round(b * 1000) / 1000;
};
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wpick = (table) => {
  const sum = Object.values(table).reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (const [k, w] of Object.entries(table)) if ((r -= w) <= 0) return k;
  return Object.keys(table)[0];
};

// ── personality drift ──────────────────────────────────────────────────
function persona(sid) {
  let h = 0; for (const c of sid) h = (h * 31 + c.charCodeAt(0)) | 0;
  const r = Math.abs(h % 100) / 100;
  if (r < 0.25) return { dist: { happy:5, surprise:2, neutral:4, sad:0.5, angry:0.3, fear:0.2, disgust:0.1 },
                          sleepP: 0.02, handP: 0.18, yawnP: 0.04 };
  if (r < 0.55) return { dist: { happy:2, surprise:1, neutral:5, sad:1, angry:0.5, fear:0.3, disgust:0.2 },
                          sleepP: 0.07, handP: 0.05, yawnP: 0.07 };
  if (r < 0.85) return { dist: { happy:0.5, surprise:0.5, neutral:4, sad:2, angry:1.5, fear:0.5, disgust:0.5 },
                          sleepP: 0.18, handP: 0.02, yawnP: 0.15 };
  return { dist: { happy:0.5, surprise:0.3, neutral:3, sad:2, angry:1, fear:0.3, disgust:0.3 },
            sleepP: 0.4, handP: 0.01, yawnP: 0.25 };
}

// ── main ────────────────────────────────────────────────────────────────
const main = async () => {
  console.log(`[stream] target lecture=${lectureId}  duration=${totalSecs}s  students=${numStudents}`);

  // Pick a roster: lecture.enrolled_student_ids if available, else random students.
  let roster = [];
  const lec = await getDoc(`lectures/${lectureId}`);
  if (lec) {
    console.log(`[stream] lecture status=${lec.status}  title=${lec.title || "—"}`);
    if (lec.status !== "recording") {
      console.warn(`[stream] WARNING: lecture is not 'recording'. The web-doctor "Live" button only appears for recording lectures. Run scripts/lecture-toggle.mjs first.`);
    }
    if (Array.isArray(lec.enrolled_student_ids) && lec.enrolled_student_ids.length) {
      roster = lec.enrolled_student_ids.slice(0, numStudents);
    }
  }
  if (!roster.length) {
    const all = await listAll("students");
    roster = all.slice(0, numStudents).map(s => s._id);
  }
  console.log(`[stream] roster: ${roster.length} students -> ${roster.slice(0,5).join(",")}${roster.length > 5 ? "…" : ""}`);

  let tick = 0;
  const start = Date.now();
  const timer = setInterval(async () => {
    tick++;
    const ts = new Date().toISOString();
    const writes = roster.map(async (sid) => {
      const p = persona(sid);
      const sleeping = Math.random() < p.sleepP;
      const handRaised = !sleeping && Math.random() < p.handP;
      const yawning = Math.random() < p.yawnP;
      const emotion = wpick(p.dist);
      const state = sleeping ? "sleeping" : "awake";
      const gesture = handRaised ? "hand_raised" :
                      (Math.random() < 0.02 ? choice(["thumbs_up","pointing","toilet_request"]) : "none");
      const obs = fields({
        student_id:       sid,
        lecture_id:       lectureId,
        subject_id:       lec?.subject_id ?? null,
        class_id:         lec?.class_id   ?? null,
        week_id:          lec?.week_id    ?? null,
        timestamp:        ts,
        emotion,
        confidence:       Math.round((0.55 + Math.random() * 0.4) * 100) / 100,
        state,
        sleep_reason:     sleeping ? choice(["eyes_closed","head_down","both"]) : null,
        gesture,
        engagement_score: engagementScore(emotion, state, gesture),
        yawning,
        yawn_reason:      yawning ? choice(["mouth_open","hand_covered","both"]) : null,
        attention_score:  Math.round((sleeping ? 0.05 + Math.random()*0.2 : 0.5 + Math.random()*0.5) * 100) / 100,
        cheat_score:      Math.round(Math.random() * 0.15 * 100) / 100,
        cheat_warning:    Math.random() < 0.02
      });
      try { await createDoc("emotions", obs); }
      catch (e) { console.error(`[stream] write err: ${e.message}`); }
    });
    await Promise.all(writes);
    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(`\r[stream] tick=${tick}  elapsed=${elapsed}s  obs_so_far=${tick * roster.length}    `);
    if (elapsed >= totalSecs) {
      clearInterval(timer);
      console.log(`\n[stream] done.`);
      process.exit(0);
    }
  }, 1000);
};

process.on("SIGINT", () => { console.log("\n[stream] interrupted."); process.exit(0); });
main().catch((e) => { console.error(e); process.exit(1); });
