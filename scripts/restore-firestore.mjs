// Restores Firestore docs (including nested subcollections) from a backup JSON
// written by backup-firestore.mjs.
//
// Usage: node scripts/restore-firestore.mjs [backup-file] [target-project]
//
// Each backed-up doc may carry { id, fields, subcollections?: { [collectionId]: Document[] } }.
// We restore the parent first, then recursively restore each subcollection doc
// at its nested path. Old backups without `subcollections` are handled transparently.

import { readFile } from "node:fs/promises";

const IN = process.argv[2] || "./firebase-emulator/backup/firestore-backup.json";
const TARGET = process.argv[3] || "fridgechef-jt50c";
const FS = `http://localhost:8080/v1/projects/${TARGET}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

async function exists(path) {
  const r = await fetch(`${FS}/${path}`, { headers: H });
  return r.ok;
}

async function createAt(parentPath, id, fields) {
  // parentPath is the collection (or nested collection) path: "transcripts" or
  // "transcripts/abc/segments". id is the doc id.
  const r = await fetch(`${FS}/${parentPath}?documentId=${encodeURIComponent(id)}`, {
    method: "POST", headers: H, body: JSON.stringify({ fields }),
  });
  return r.ok;
}

async function restoreDoc(parentCollectionPath, d) {
  const docPath = `${parentCollectionPath}/${d.id}`;
  let restored = 0, skipped = 0;
  if (await exists(docPath)) {
    skipped += 1;
  } else if (await createAt(parentCollectionPath, d.id, d.fields)) {
    restored += 1;
  }

  // Recurse into subcollections (if any).
  const subs = d.subcollections || {};
  for (const [subId, subDocs] of Object.entries(subs)) {
    const childParent = `${docPath}/${subId}`;
    for (const child of subDocs) {
      const r = await restoreDoc(childParent, child);
      restored += r.restored;
      skipped += r.skipped;
    }
  }
  return { restored, skipped };
}

async function main() {
  const dump = JSON.parse(await readFile(IN, "utf8"));
  console.log(`[restore] from ${IN}  target=${TARGET}  exported=${dump.exportedAt}`);
  let totalR = 0, totalS = 0;
  for (const [c, docs] of Object.entries(dump.collections)) {
    let cR = 0, cS = 0;
    for (const d of docs) {
      const r = await restoreDoc(c, d);
      cR += r.restored;
      cS += r.skipped;
    }
    console.log(`  ${c}: restored=${cR} skipped(exists)=${cS}`);
    totalR += cR; totalS += cS;
  }
  console.log(`[restore] done. restored=${totalR}  skipped=${totalS}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
