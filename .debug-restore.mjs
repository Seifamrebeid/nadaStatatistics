// Debug restore — same logic as restore-firestore.mjs but prints the first
// few errors so we can see why createAt is returning false.
import { readFile } from "node:fs/promises";

const IN = "./firebase-emulator/backup/firestore-backup.json";
const TARGET = "fridgechef-jt50c";
const FS = `http://localhost:8080/v1/projects/${TARGET}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

let errorsSeen = 0;
const MAX_ERRORS = 5;

async function exists(path) {
  const r = await fetch(`${FS}/${path}`, { headers: H });
  return r.ok;
}

async function createAt(parentPath, id, fields) {
  const url = `${FS}/${parentPath}?documentId=${encodeURIComponent(id)}`;
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify({ fields }) });
  if (!r.ok && errorsSeen < MAX_ERRORS) {
    errorsSeen++;
    const txt = await r.text().catch(() => "(no body)");
    console.error(`[ERR] POST ${parentPath}/${id} -> HTTP ${r.status}`);
    console.error(`      url: ${url}`);
    console.error(`      body: ${txt.slice(0, 500)}`);
  }
  return r.ok;
}

async function restoreDoc(parent, d) {
  const docPath = `${parent}/${d.id}`;
  let restored = 0, skipped = 0;
  if (await exists(docPath)) skipped++;
  else if (await createAt(parent, d.id, d.fields)) restored++;
  const subs = d.subcollections || {};
  for (const [sub, kids] of Object.entries(subs)) {
    for (const k of kids) {
      const r = await restoreDoc(`${docPath}/${sub}`, k);
      restored += r.restored; skipped += r.skipped;
    }
  }
  return { restored, skipped };
}

const dump = JSON.parse(await readFile(IN, "utf8"));
// Just restore weeks (smallest known failing set).
const wks = dump.collections.weeks.slice(0, 3);
console.log(`Trying ${wks.length} sample weeks...`);
for (const d of wks) {
  const r = await restoreDoc("weeks", d);
  console.log(`  ${d.id}: restored=${r.restored} skipped=${r.skipped}`);
}
