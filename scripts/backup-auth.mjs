// Dumps every Auth user in the running emulator to JSON so it can be replayed
// later via restore-auth.mjs. Pairs with backup-firestore.mjs.
//
// Usage:
//   node scripts/backup-auth.mjs [project] [out-file]

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const PROJECT = process.argv[2] || "fridgechef-jt50c";
const OUT = process.argv[3] || "./firebase-emulator/backup/auth-backup.json";
const BASE = `http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const H = { Authorization: "Bearer owner", "Content-Type": "application/json" };

async function listAll() {
  const out = [];
  let nextPageToken;
  do {
    const body = { maxResults: 1000, ...(nextPageToken ? { nextPageToken } : {}) };
    const r = await fetch(`${BASE}/accounts:query`, {
      method: "POST", headers: H, body: JSON.stringify(body),
    });
    if (!r.ok) {
      console.error(`auth listAll failed: ${r.status} ${await r.text()}`);
      break;
    }
    const data = await r.json();
    out.push(...(data.userInfo || []));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  return out;
}

const users = await listAll();
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ users }, null, 2));
console.log(`[backup-auth] wrote ${users.length} users -> ${OUT}`);
