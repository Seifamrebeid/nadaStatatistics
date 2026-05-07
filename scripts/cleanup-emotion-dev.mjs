// Removes partial-seed docs from emotion-detection-dev so a fresh seed is clean.
const PROJECT = "emotion-detection-dev";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

async function listAll(collection) {
  const r = await fetch(`${FS}:runQuery`, {
    method: "POST", headers: H,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], select: { fields: [{ fieldPath: "__name__" }] } } }),
  });
  const arr = await r.json();
  return (arr || []).filter((x) => x.document).map((x) => x.document.name);
}

async function del(name) {
  const path = name.replace(/^.*\/documents\//, "");
  const r = await fetch(`${FS}/${path}`, { method: "DELETE", headers: H });
  if (!r.ok) console.error("del", path, r.status);
}

const KEEP_DOCTORS = new Set(["doc_cbebc4001c"]); // pre-existing nada
const KEEP_USERS = new Set([]); // we'll keep any whose role !== "doctor" tied to our partial seed

async function main() {
  for (const c of ["weeks", "classes", "subjects"]) {
    const names = await listAll(c);
    console.log(`${c}: deleting ${names.length}`);
    for (const n of names) await del(n);
  }
  // Delete only doctor docs not in KEEP set.
  const docs = await listAll("doctors");
  for (const n of docs) {
    const id = n.split("/").pop();
    if (KEEP_DOCTORS.has(id)) continue;
    console.log("delete doctor", id);
    await del(n);
  }
  // For users, fetch each and delete if role=="doctor" and linked_id not in KEEP_DOCTORS.
  const users = await listAll("users");
  for (const n of users) {
    const r = await fetch(n.replace("projects/", FS.replace(/.*projects\//, "projects/")) , { headers: H });
    // Easier: just GET via FS path
    const path = n.replace(/^.*\/documents\//, "");
    const gr = await fetch(`${FS}/${path}`, { headers: H });
    const doc = await gr.json();
    const role = doc.fields?.role?.stringValue;
    const linked = doc.fields?.linked_id?.stringValue;
    if (role === "doctor" && !KEEP_DOCTORS.has(linked)) {
      console.log("delete user", path);
      await del(n);
    }
  }
  console.log("cleanup done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
