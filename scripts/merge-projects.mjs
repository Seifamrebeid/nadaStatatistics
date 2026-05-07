// Merges all docs from nada-stats-dev and demo-nada INTO emotion-detection-dev.
// Strategy:
//   - Copy each doc to target preserving its ID. If the ID already exists in
//     target, skip it (so we never overwrite the canonical app data).
//   - After copy, delete the doc from the source so the orphan projects end up empty.
// Usage: node scripts/merge-projects.mjs

const TARGET = "emotion-detection-dev";
const SOURCES = ["nada-stats-dev", "demo-nada"];
const COLLECTIONS = ["admins", "doctors", "users", "students", "subjects", "classes", "weeks", "lectures", "notifications", "transcripts", "emotions"];
const FS_BASE = (p) => `http://localhost:8080/v1/projects/${p}/databases/(default)/documents`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

async function listAll(project, collection) {
  const r = await fetch(`${FS_BASE(project)}:runQuery`, {
    method: "POST", headers: H,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }] } }),
  });
  if (!r.ok) return [];
  const arr = await r.json();
  return (arr || [])
    .filter((x) => x.document)
    .map((x) => ({ id: x.document.name.split("/").pop(), fields: x.document.fields || {} }));
}

async function exists(project, collection, id) {
  const r = await fetch(`${FS_BASE(project)}/${collection}/${encodeURIComponent(id)}`, { headers: H });
  return r.ok;
}

async function createAt(project, collection, id, fields) {
  const r = await fetch(`${FS_BASE(project)}/${collection}?documentId=${encodeURIComponent(id)}`, {
    method: "POST", headers: H, body: JSON.stringify({ fields }),
  });
  return r.ok;
}

async function del(project, collection, id) {
  await fetch(`${FS_BASE(project)}/${collection}/${encodeURIComponent(id)}`, { method: "DELETE", headers: H });
}

async function main() {
  let copied = 0, skipped = 0;
  for (const src of SOURCES) {
    console.log(`\n=== merging ${src} -> ${TARGET} ===`);
    for (const c of COLLECTIONS) {
      const docs = await listAll(src, c);
      if (docs.length === 0) continue;
      let cCopied = 0, cSkipped = 0;
      for (const d of docs) {
        if (await exists(TARGET, c, d.id)) {
          cSkipped += 1;
        } else {
          if (await createAt(TARGET, c, d.id, d.fields)) cCopied += 1;
        }
        await del(src, c, d.id);
      }
      console.log(`  ${c}: copied=${cCopied} skipped=${cSkipped} (source emptied)`);
      copied += cCopied; skipped += cSkipped;
    }
  }
  console.log(`\n[merge] total copied=${copied}  skipped(id-collision)=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
