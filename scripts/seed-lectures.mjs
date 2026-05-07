// Creates one lecture per week, linking it to the doctor who owns the
// week's subject. Run after seed-curriculum.mjs.
// Usage: node scripts/seed-lectures.mjs

const PROJECT = process.env.FIREBASE_PROJECT_ID || "emotion-detection-dev";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const newId = (p) => `${p}_${Math.random().toString(16).slice(2, 12)}`;

function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = encode(val);
    return { mapValue: { fields } };
  }
  throw new Error(`unsupported value: ${v}`);
}

function fields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = encode(v);
  }
  return out;
}

function decode(field) {
  if (!field) return undefined;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
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
  if (!r.ok) throw new Error(`list ${collection}: ${r.status} ${await r.text()}`);
  const arr = await r.json();
  return (arr || [])
    .filter((x) => x.document)
    .map((x) => {
      const id = x.document.name.split("/").pop();
      const data = {};
      for (const [k, v] of Object.entries(x.document.fields || {})) data[k] = decode(v);
      return { id, ...data };
    });
}

async function fsCreateAt(collection, docId, data) {
  const r = await fetch(`${FS}/${collection}?documentId=${encodeURIComponent(docId)}`, {
    method: "POST", headers: H,
    body: JSON.stringify({ fields: fields(data) }),
  });
  if (!r.ok) throw new Error(`create ${collection}/${docId}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function fsPatch(collection, docId, data) {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const r = await fetch(`${FS}/${collection}/${encodeURIComponent(docId)}?${mask}`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ fields: fields(data) }),
  });
  if (!r.ok) throw new Error(`patch ${collection}/${docId}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  console.log(`[seed-lectures] project=${PROJECT}`);

  const [weeks, classes, subjects] = await Promise.all([
    listAll("weeks"), listAll("classes"), listAll("subjects"),
  ]);
  console.log(`  weeks=${weeks.length}  classes=${classes.length}  subjects=${subjects.length}`);

  const classById = new Map(classes.map((c) => [c.id, c]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  // Skip weeks that already have a lecture linked.
  const todo = weeks.filter((w) => !w.lecture_id);
  console.log(`  weeks needing a lecture: ${todo.length}`);

  const ts = nowIso();
  let ok = 0, skipped = 0, errors = 0;

  for (const wk of todo) {
    const cls = classById.get(wk.class_id);
    const subj = cls ? subjectById.get(cls.subject_id) : null;
    if (!cls || !subj || !subj.doctor_id) {
      skipped += 1;
      continue;
    }
    const lectureId = newId("lec");
    const title = `${subj.name} — Week ${wk.week_number ?? "?"}${cls.section ? ` (${cls.section})` : ""}`;
    try {
      await fsCreateAt("lectures", lectureId, {
        lecture_id: lectureId,
        title,
        doctor_id: subj.doctor_id,
        week_id: wk.id,
        class_id: cls.id,
        subject_id: subj.id,
        status: "scheduled",
        scheduled_at: wk.scheduled_start || wk.date || null,
        enrolled_student_ids: Array.isArray(cls.enrolled_student_ids)
          ? cls.enrolled_student_ids
          : [],
        created_at: ts,
      });
      await fsPatch("weeks", wk.id, { lecture_id: lectureId });
      ok += 1;
      if (ok % 30 === 0) console.log(`  ...${ok} lectures created`);
    } catch (e) {
      errors += 1;
      console.error(`  error on week ${wk.id}: ${e.message}`);
    }
  }

  console.log(`[seed-lectures] done. created=${ok}  skipped=${skipped}  errors=${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
