// seeds aggregated grade documents into Firestore emulator (collection: grades)
// Usage: node scripts/seed-grades.mjs

const PROJECT = process.env.FIREBASE_PROJECT_ID || "emotion-detection-dev";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

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
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  throw new Error(`encode: ${v}`);
}
function fields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj))
    if (v !== undefined) out[k] = encode(v);
  return out;
}

async function listAll(collection) {
  const r = await fetch(`${FS}:runQuery`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: collection }] },
    }),
  });
  if (!r.ok) return [];
  const arr = await r.json();
  return (arr || [])
    .filter((x) => x.document)
    .map((x) => {
      const id = x.document.name.split("/").pop();
      const data = {};
      for (const [k, v] of Object.entries(x.document.fields || {}))
        data[k] = decode(v);
      return { id, ...data };
    });
}

async function fsCreate(collection, data) {
  const r = await fetch(`${FS}/${collection}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ fields: fields(data) }),
  });
  if (!r.ok)
    throw new Error(`create ${collection}: ${r.status} ${await r.text()}`);
}

function markToGrade(mark) {
  if (mark === null || mark === undefined || Number.isNaN(Number(mark)))
    return "F";
  mark = Number(mark);
  if (mark >= 97) return "A*";
  if (mark >= 93) return "A";
  if (mark >= 90) return "A-";
  if (mark >= 87) return "B+";
  if (mark >= 83) return "B";
  if (mark >= 80) return "B-";
  if (mark >= 77) return "C+";
  if (mark >= 73) return "C";
  if (mark >= 70) return "C-";
  if (mark >= 67) return "D+";
  if (mark >= 63) return "D";
  if (mark >= 60) return "D-";
  return "F";
}

async function main() {
  console.log(`[seed-grades] project=${PROJECT}`);
  const [emotions, lectures, students, subjects, doctors] = await Promise.all([
    listAll("emotions"),
    listAll("lectures"),
    listAll("students"),
    listAll("subjects"),
    listAll("doctors"),
  ]);

  if (emotions.length === 0) {
    console.error(
      "No emotions found — run scripts/seed-emotions.mjs first or ensure data exists.",
    );
    process.exit(1);
  }

  // Build lookups
  const lecById = Object.fromEntries((lectures || []).map((l) => [l.id, l]));
  const subjById = Object.fromEntries((subjects || []).map((s) => [s.id, s]));
  const docById = Object.fromEntries((doctors || []).map((d) => [d.id, d]));
  const studById = Object.fromEntries((students || []).map((s) => [s.id, s]));

  // Aggregate mean engagement by student_id + subject_id
  const buckets = {};
  for (const e of emotions) {
    if (e.engagement_score === undefined || e.engagement_score === null)
      continue;
    const lec = lecById[e.lecture_id] || {};
    const subject_id = lec.subject_id || null;
    const doctor_id = lec.doctor_id || null;
    const key = `${e.student_id}||${subject_id || "__none__"}`;
    if (!buckets[key])
      buckets[key] = {
        student_id: e.student_id,
        subject_id: subject_id,
        doctor_id: doctor_id,
        sum: 0,
        n: 0,
      };
    buckets[key].sum += Number(e.engagement_score);
    buckets[key].n += 1;
  }

  let total = 0;
  for (const k of Object.keys(buckets)) {
    const b = buckets[k];
    const mark = Math.round((b.sum / b.n) * 1000) / 10; // one decimal
    const grade = markToGrade(mark);
    const subj = subjById[b.subject_id] || {};
    const doc = docById[b.doctor_id] || {};
    const stud = studById[b.student_id] || {};

    const docObj = {
      student_id: b.student_id,
      student_name: stud.name || "",
      subject_id: b.subject_id || "",
      subject_name: subj.name || "",
      doctor_id: b.doctor_id || "",
      doctor_name: doc.name || "",
      mark: Number(mark),
      grade: grade,
      observations: b.n,
      computed_at: new Date().toISOString(),
    };

    await fsCreate("grades", docObj);
    total += 1;
    if (total % 50 === 0) process.stdout.write(` wrote ${total}\r`);
  }

  console.log(`\n[seed-grades] done. wrote ${total} grade documents.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
