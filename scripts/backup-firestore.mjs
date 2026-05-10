// Dumps every Firestore doc (including subcollections) from a project
// to a single JSON file, preserving full typed-value fields for accurate restore.
//
// Usage: node scripts/backup-firestore.mjs [project] [out-file]
//
// Subcollections: each backed-up document carries an optional "subcollections"
// map: { [collectionId]: Document[] }. The restore script reads this and
// recreates the nested docs under their parent.
//
// Discovery uses Firestore's :listCollectionIds endpoint so this works for any
// nested collection (not just transcripts/*/segments).

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const PROJECT = process.argv[2] || "fridgechef-jt50c";
const OUT = process.argv[3] || "./firebase-emulator/backup/firestore-backup.json";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

const TOP_COLLECTIONS = [
  "admins", "doctors", "users", "students", "parents",
  "subjects", "classes", "weeks", "lectures",
  "notifications", "transcripts", "emotions",
  "attendance", "grades", "warnings", "recommendations",
];

// ── REST helpers ─────────────────────────────────────────────────────────────

async function runQuery(collectionPath) {
  // Works for top-level collections. The collectionPath is just the id.
  const r = await fetch(`${FS}:runQuery`, {
    method: "POST", headers: H,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collectionPath }] } }),
  });
  if (!r.ok) return [];
  const arr = await r.json();
  return (arr || [])
    .filter((x) => x.document)
    .map((x) => ({
      id: x.document.name.split("/").pop(),
      fullPath: x.document.name,
      fields: x.document.fields || {},
    }));
}

async function listSubcollectionDocs(parentDocPath, collectionId) {
  // Subcollection docs: GET /v1/.../{parent}/{collectionId}?pageSize=...
  const all = [];
  let pageToken = null;
  while (true) {
    const url = new URL(`${FS}/${parentDocPath}/${collectionId}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url.toString(), { headers: H });
    if (!r.ok) break;
    const json = await r.json();
    for (const d of (json.documents || [])) {
      all.push({
        id: d.name.split("/").pop(),
        fullPath: d.name,
        fields: d.fields || {},
      });
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return all;
}

async function listSubcollectionIds(parentDocPath) {
  // parentDocPath is the doc's relative path under .../documents/
  const r = await fetch(`${FS}/${parentDocPath}:listCollectionIds`, {
    method: "POST", headers: H, body: JSON.stringify({}),
  });
  if (!r.ok) return [];
  const json = await r.json();
  return json.collectionIds || [];
}

// ── Recursive walk ───────────────────────────────────────────────────────────

async function dumpDoc(doc) {
  // `doc` already has { id, fullPath, fields }. Walk its subcollections.
  const relPath = doc.fullPath.replace(/^.*\/documents\//, "");
  const subIds = await listSubcollectionIds(relPath);
  if (subIds.length === 0) return { id: doc.id, fields: doc.fields };

  const subs = {};
  for (const subId of subIds) {
    const docs = await listSubcollectionDocs(relPath, subId);
    const dumped = [];
    for (const d of docs) dumped.push(await dumpDoc(d));
    subs[subId] = dumped;
  }
  return { id: doc.id, fields: doc.fields, subcollections: subs };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dump = { project: PROJECT, exportedAt: new Date().toISOString(), collections: {} };
  for (const c of TOP_COLLECTIONS) {
    const docs = await runQuery(c);
    const out = [];
    for (const d of docs) out.push(await dumpDoc(d));
    dump.collections[c] = out;
    const subCount = out.reduce(
      (n, x) => n + Object.values(x.subcollections || {}).reduce((m, arr) => m + arr.length, 0),
      0,
    );
    console.log(`  ${c}: ${out.length}${subCount ? ` (+${subCount} nested)` : ""}`);
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(dump, null, 2));
  const totalTop = Object.values(dump.collections).reduce((a, v) => a + v.length, 0);
  console.log(`[backup] wrote ${totalTop} top-level docs (+nested) -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
