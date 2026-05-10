// Dumps every Firestore doc from a project (emotion-detection-dev by default)
// to a single JSON file, preserving full typed-value fields for accurate restore.
// Usage: node scripts/backup-firestore.mjs [project] [out-file]

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const PROJECT = process.argv[2] || "fridgechef-jt50c";
const OUT = process.argv[3] || "./firebase-emulator/backup/firestore-backup.json";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

const COLLECTIONS = [
  "admins", "doctors", "users", "students", "parents",
  "subjects", "classes", "weeks", "lectures",
  "notifications", "transcripts", "emotions",
];

async function listAll(collection) {
  const r = await fetch(`${FS}:runQuery`, {
    method: "POST", headers: H,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }] } }),
  });
  if (!r.ok) return [];
  const arr = await r.json();
  return (arr || [])
    .filter((x) => x.document)
    .map((x) => ({ id: x.document.name.split("/").pop(), fields: x.document.fields || {} }));
}

async function main() {
  const dump = { project: PROJECT, exportedAt: new Date().toISOString(), collections: {} };
  for (const c of COLLECTIONS) {
    const docs = await listAll(c);
    dump.collections[c] = docs;
    console.log(`  ${c}: ${docs.length}`);
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(dump, null, 2));
  const total = Object.values(dump.collections).reduce((a, v) => a + v.length, 0);
  console.log(`[backup] wrote ${total} docs -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
