// Flip a lecture's status in the Firestore emulator: scheduled <-> recording
// <-> finished. Mirrors what the Python classroom app would do on start/quit.
//
// Usage:
//   node scripts/lecture-toggle.mjs <lecture_id> start    # -> status=recording
//   node scripts/lecture-toggle.mjs <lecture_id> stop     # -> status=finished
//   node scripts/lecture-toggle.mjs list                  # show active+recent
//
// Env: FIREBASE_PROJECT_ID (default fridgechef-jt50c)

const PROJECT = process.env.FIREBASE_PROJECT_ID || "fridgechef-jt50c";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const H  = { Authorization: "Bearer owner", "Content-Type": "application/json" };

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

async function listLectures() {
  const out = [];
  let token = null;
  while (true) {
    const url = new URL(`${FS}/lectures`);
    url.searchParams.set("pageSize", "300");
    if (token) url.searchParams.set("pageToken", token);
    const r = await fetch(url, { headers: H });
    if (!r.ok) throw new Error(`list HTTP ${r.status}`);
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

async function patchLecture(id, partial) {
  const masks = Object.keys(partial).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const url = `${FS}/lectures/${encodeURIComponent(id)}?${masks}`;
  const fields = {}; for (const [k, v] of Object.entries(partial)) fields[k] = encode(v);
  const r = await fetch(url, { method: "PATCH", headers: H, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`patch ${id} HTTP ${r.status}: ${await r.text()}`);
}

const cmd = process.argv[2];
const arg = process.argv[3];

if (!cmd || cmd === "list") {
  const all = await listLectures();
  const recording = all.filter(l => l.status === "recording");
  const recent = all.filter(l => l.status !== "recording")
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 10);
  console.log(`\n=== Currently RECORDING (${recording.length}) ===`);
  for (const l of recording) console.log(`  ${l._id}  ${l.title || ""}  date=${l.date || "—"}`);
  console.log(`\n=== Recent ${recent.length} lectures ===`);
  for (const l of recent) console.log(`  ${l._id}  status=${l.status}  ${l.title || ""}  date=${l.date || "—"}`);
  process.exit(0);
}

if (!arg) { console.error("usage: lecture-toggle.mjs <lecture_id> start|stop  OR list"); process.exit(1); }

const lecId = cmd;
const action = (arg || "").toLowerCase();
const now = new Date().toISOString();

if (action === "start") {
  await patchLecture(lecId, { status: "recording", started_at: now });
  console.log(`[live] lecture ${lecId} -> recording  (started_at=${now})`);
} else if (action === "stop" || action === "end" || action === "finish") {
  await patchLecture(lecId, { status: "finished", finalized_at: now });
  console.log(`[live] lecture ${lecId} -> finished  (finalized_at=${now})`);
} else if (action === "scheduled" || action === "reset") {
  await patchLecture(lecId, { status: "scheduled" });
  console.log(`[live] lecture ${lecId} -> scheduled`);
} else {
  console.error(`unknown action '${action}'. use start|stop|reset`); process.exit(1);
}
