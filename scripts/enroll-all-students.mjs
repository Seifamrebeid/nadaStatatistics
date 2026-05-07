// Enrolls every active student in every active class (in the running emulator).
// Idempotent: re-running just rewrites the same enrolled_student_ids list.
// Usage: node scripts/enroll-all-students.mjs

const PROJECT = process.env.FIREBASE_PROJECT_ID || "emotion-detection-dev";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const HEADERS = {
  Authorization: "Bearer owner",
  "Content-Type": "application/json",
};

function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = encode(val);
    return { mapValue: { fields } };
  }
  throw new Error(`unsupported value: ${v}`);
}

async function listAll(collection) {
  const r = await fetch(`${FS}:runQuery`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: collection }] },
    }),
  });
  if (!r.ok) throw new Error(`list ${collection}: ${r.status} ${await r.text()}`);
  const arr = await r.json();
  return (arr || [])
    .filter((x) => x.document)
    .map((x) => ({
      id: x.document.name.split("/").pop(),
      fields: x.document.fields || {},
    }));
}

async function patchField(collection, id, fieldName, value) {
  const url = `${FS}/${collection}/${encodeURIComponent(
    id,
  )}?updateMask.fieldPaths=${encodeURIComponent(fieldName)}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify({ fields: { [fieldName]: encode(value) } }),
  });
  if (!r.ok)
    throw new Error(
      `patch ${collection}/${id}.${fieldName}: ${r.status} ${await r.text()}`,
    );
}

export async function enrollAllStudentsInAllClasses() {
  const [students, classes, lectures] = await Promise.all([
    listAll("students"),
    listAll("classes"),
    listAll("lectures"),
  ]);

  const studentIds = students
    .filter((s) => s.fields.active?.booleanValue !== false)
    .map((s) => s.id);

  const activeClasses = classes.filter(
    (c) => c.fields.active?.booleanValue !== false,
  );

  console.log(
    `[enroll] ${studentIds.length} students -> ${activeClasses.length} classes, ${lectures.length} lectures`,
  );

  for (const c of activeClasses) {
    await patchField("classes", c.id, "enrolled_student_ids", studentIds);
  }
  console.log(`  classes: ${activeClasses.length} updated`);

  for (const l of lectures) {
    await patchField("lectures", l.id, "enrolled_student_ids", studentIds);
  }
  console.log(`  lectures: ${lectures.length} updated`);

  return {
    students: studentIds.length,
    classes: activeClasses.length,
    lectures: lectures.length,
  };
}

// Run as a script when invoked directly
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  enrollAllStudentsInAllClasses()
    .then((r) =>
      console.log(
        `[enroll] done. ${r.students} students × ${r.classes} classes × ${r.lectures} lectures`,
      ),
    )
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
