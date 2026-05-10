// Restores Firestore docs from a backup JSON written by backup-firestore.mjs.
// Usage: node scripts/restore-firestore.mjs [backup-file] [target-project]

import { readFile } from "node:fs/promises";

const IN = process.argv[2] || "./firebase-emulator/backup/firestore-backup.json";
const TARGET = process.argv[3] || "fridgechef-jt50c";
const FS = `http://localhost:8080/v1/projects/${TARGET}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

async function exists(collection, id) {
  const r = await fetch(`${FS}/${collection}/${encodeURIComponent(id)}`, { headers: H });
  return r.ok;
}

async function createAt(collection, id, fields) {
  const r = await fetch(`${FS}/${collection}?documentId=${encodeURIComponent(id)}`, {
    method: "POST", headers: H, body: JSON.stringify({ fields }),
  });
  return r.ok;
}

async function main() {
  const dump = JSON.parse(await readFile(IN, "utf8"));
  console.log(`[restore] from ${IN}  target=${TARGET}  exported=${dump.exportedAt}`);
  let restored = 0, skipped = 0;
  for (const [c, docs] of Object.entries(dump.collections)) {
    let cR = 0, cS = 0;
    for (const d of docs) {
      if (await exists(c, d.id)) { cS += 1; continue; }
      if (await createAt(c, d.id, d.fields)) cR += 1;
    }
    console.log(`  ${c}: restored=${cR} skipped(exists)=${cS}`);
    restored += cR; skipped += cS;
  }
  console.log(`[restore] done. restored=${restored}  skipped=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
