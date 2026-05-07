// Replays the local backups (firestore-backup.json + auth-backup.json) into a
// REAL Firebase project (Firestore + Auth). Uses the Admin SDK with a
// service-account JSON.
//
// Setup (one-time):
//   1. Firebase console -> Project settings -> Service accounts ->
//      "Generate new private key" -> save as ./firebase-admin-key.json
//      (this file is gitignored)
//   2. npm install firebase-admin   (already done if you used `npm install`)
//
// Run:
//   node scripts/upload-to-cloud.mjs
//
// Options:
//   --key <path>                 service-account JSON (default: ./firebase-admin-key.json,
//                                or env GOOGLE_APPLICATION_CREDENTIALS)
//   --firestore <path>           Firestore backup (default: firebase-emulator/backup/firestore-backup.json)
//   --auth <path>                Auth backup       (default: firebase-emulator/backup/auth-backup.json)
//   --default-password <pw>      password for restored users (default: classroom2026!)
//   --skip-firestore             only upload auth users
//   --skip-auth                  only upload Firestore docs
//   --collections a,b,c          only restore these Firestore collections

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import admin from "firebase-admin";

// ---------- arg parsing ----------
const argv = process.argv.slice(2);
function getArg(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
}
const HAS = (name) => argv.includes(name);

const KEY = getArg("--key",
  process.env.GOOGLE_APPLICATION_CREDENTIALS || "./firebase-admin-key.json"
);
const FIRESTORE_BACKUP = getArg("--firestore", "./firebase-emulator/backup/firestore-backup.json");
const AUTH_BACKUP      = getArg("--auth",      "./firebase-emulator/backup/auth-backup.json");
const DEFAULT_PASSWORD = getArg("--default-password", "classroom2026!");
const ONLY_COLLECTIONS = getArg("--collections", null)?.split(",").map(s => s.trim()).filter(Boolean);
const SKIP_FIRESTORE   = HAS("--skip-firestore");
const SKIP_AUTH        = HAS("--skip-auth");

// ---------- init admin ----------
if (!existsSync(KEY)) {
  console.error(`Service-account JSON not found at: ${KEY}`);
  console.error("Download one from Firebase console (Project settings -> Service accounts");
  console.error("-> Generate new private key) and save it as ./firebase-admin-key.json,");
  console.error("or pass --key <path>.");
  process.exit(1);
}
const serviceAccount = JSON.parse(await readFile(KEY, "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});
const db = admin.firestore();
const auth = admin.auth();
console.log(`[upload] using project ${serviceAccount.project_id}`);

// ---------- typed-value -> native JS ----------
function fromTV(v) {
  if (v === null || v === undefined) return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) {
    const n = Number(v.integerValue);
    return Number.isSafeInteger(n) ? n : v.integerValue; // huge ints stay strings
  }
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("bytesValue" in v) return Buffer.from(v.bytesValue, "base64");
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return new admin.firestore.GeoPoint(
    Number(v.geoPointValue.latitude || 0),
    Number(v.geoPointValue.longitude || 0)
  );
  if ("mapValue" in v) {
    const out = {};
    for (const [k, vv] of Object.entries(v.mapValue.fields || {})) out[k] = fromTV(vv);
    return out;
  }
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromTV);
  return null;
}

function fieldsToNative(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromTV(v);
  return out;
}

// ---------- Firestore upload ----------
async function uploadFirestore() {
  if (!existsSync(FIRESTORE_BACKUP)) {
    console.warn(`[firestore] backup not found at ${FIRESTORE_BACKUP} — skipping`);
    return;
  }
  const dump = JSON.parse(await readFile(FIRESTORE_BACKUP, "utf8"));
  console.log(`[firestore] from ${FIRESTORE_BACKUP}  exported=${dump.exportedAt}`);

  let totalDocs = 0, written = 0;
  for (const [coll, docs] of Object.entries(dump.collections || {})) {
    if (ONLY_COLLECTIONS && !ONLY_COLLECTIONS.includes(coll)) continue;
    if (!docs || docs.length === 0) {
      console.log(`  ${coll}: 0 (skip)`);
      continue;
    }
    totalDocs += docs.length;

    // Batch in chunks of 400 (under the 500 hard limit, leaves room for indexed fields).
    const CHUNK = 400;
    let cWritten = 0;
    for (let i = 0; i < docs.length; i += CHUNK) {
      const slice = docs.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const d of slice) {
        const ref = db.collection(coll).doc(d.id);
        batch.set(ref, fieldsToNative(d.fields));
      }
      await batch.commit();
      cWritten += slice.length;
      process.stdout.write(`\r  ${coll}: ${cWritten}/${docs.length}`);
    }
    process.stdout.write(`\r  ${coll}: ${cWritten}/${docs.length}\n`);
    written += cWritten;
  }
  console.log(`[firestore] uploaded ${written}/${totalDocs} docs`);
}

// ---------- Auth upload ----------
async function uploadAuth() {
  if (!existsSync(AUTH_BACKUP)) {
    console.warn(`[auth] backup not found at ${AUTH_BACKUP} — skipping`);
    return;
  }
  const data = JSON.parse(await readFile(AUTH_BACKUP, "utf8"));
  const users = data.users || [];
  console.log(`[auth] ${users.length} users to import (default password: ${DEFAULT_PASSWORD})`);

  let created = 0, exists = 0, failed = 0;
  for (const u of users) {
    if (!u.email) {
      console.warn(`  skip user ${u.localId} — no email`);
      continue;
    }
    try {
      await auth.createUser({
        uid: u.localId,
        email: u.email,
        emailVerified: !!u.emailVerified,
        displayName: u.displayName || undefined,
        password: DEFAULT_PASSWORD,
        disabled: false,
      });
      created += 1;
      process.stdout.write(`\r  created ${created}  exists ${exists}  failed ${failed}`);
    } catch (e) {
      const code = e.code || "";
      if (code === "auth/uid-already-exists" || code === "auth/email-already-exists") {
        exists += 1;
      } else {
        failed += 1;
        console.warn(`\n  ${u.email}: ${e.message}`);
      }
      process.stdout.write(`\r  created ${created}  exists ${exists}  failed ${failed}`);
    }
  }
  process.stdout.write("\n");
  console.log(`[auth] done. created=${created}  already-exists=${exists}  failed=${failed}`);
  console.log(`[auth] all NEW users have password: ${DEFAULT_PASSWORD}`);
  console.log(`[auth] users that already existed kept their existing passwords.`);
}

// ---------- run ----------
try {
  if (!SKIP_FIRESTORE) await uploadFirestore();
  if (!SKIP_AUTH)      await uploadAuth();
  console.log("[upload] all done.");
} catch (e) {
  console.error("[upload] fatal:", e);
  process.exit(1);
}
