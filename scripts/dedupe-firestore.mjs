// Removes duplicate subjects/classes/weeks/doctors that were dragged in by
// merge-projects.mjs. The canonical entities are the ones referenced by the
// 240 seeded lectures (lectures store subject_id, class_id, week_id, doctor_id).
// Anything in those collections that no lecture references is treated as a
// duplicate and deleted. Students/admins/users are not touched.
// Usage: node scripts/dedupe-firestore.mjs

const PROJECT = process.env.FIREBASE_PROJECT_ID || "emotion-detection-dev";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

function decode(field) {
  if (!field) return undefined;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.nullValue !== undefined) return null;
  if (field.arrayValue) return (field.arrayValue.values || []).map(decode);
  if (field.mapValue) {
    const out = {};
    for (const [k, v] of Object.entries(field.mapValue.fields || {})) out[k] = decode(v);
    return out;
  }
  return undefined;
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

async function del(collection, id) {
  await fetch(`${FS}/${collection}/${encodeURIComponent(id)}`, { method: "DELETE", headers: H });
}

async function main() {
  console.log(`[dedupe] project=${PROJECT}`);
  const [lectures, subjects, classes, weeks, doctors] = await Promise.all([
    listAll("lectures"), listAll("subjects"), listAll("classes"),
    listAll("weeks"), listAll("doctors"),
  ]);
  console.log(`  before: subjects=${subjects.length} classes=${classes.length} weeks=${weeks.length} doctors=${doctors.length} lectures=${lectures.length}`);

  // Canonical IDs = anything referenced by a lecture.
  const keepSubjects = new Set(lectures.map((l) => l.subject_id).filter(Boolean));
  const keepClasses  = new Set(lectures.map((l) => l.class_id).filter(Boolean));
  const keepWeeks    = new Set(lectures.map((l) => l.week_id).filter(Boolean));
  const keepDoctors  = new Set(lectures.map((l) => l.doctor_id).filter(Boolean));

  // Delete the duplicates.
  let dS = 0, dC = 0, dW = 0, dD = 0;
  for (const s of subjects) if (!keepSubjects.has(s.id)) { await del("subjects", s.id); dS += 1; }
  for (const c of classes)  if (!keepClasses.has(c.id))  { await del("classes",  c.id); dC += 1; }
  for (const w of weeks)    if (!keepWeeks.has(w.id))    { await del("weeks",    w.id); dW += 1; }
  for (const d of doctors)  if (!keepDoctors.has(d.id))  { await del("doctors",  d.id); dD += 1; }

  console.log(`  deleted: subjects=${dS} classes=${dC} weeks=${dW} doctors=${dD}`);
  console.log(`  kept:    subjects=${keepSubjects.size} classes=${keepClasses.size} weeks=${keepWeeks.size} doctors=${keepDoctors.size}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
