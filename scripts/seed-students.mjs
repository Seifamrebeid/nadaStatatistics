// Uploads 125 students from StudentPicsDataset.xlsx to real Firebase.
// Creates Firebase Auth user + students/{studentId} doc + users/{uid} doc.
// Safe to re-run — skips existing auth users and upserts Firestore docs.
//
// Usage:
//   node scripts/seed-students.mjs
//   node scripts/seed-students.mjs --key ./firebaseservice_account.json

import admin from "firebase-admin";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { read, utils } from "xlsx";

const argv = process.argv.slice(2);
const KEY = argv[argv.indexOf("--key") + 1] || "./firebaseservice_account.json";

if (!existsSync(KEY)) {
  console.error(`Service-account not found: ${KEY}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(await readFile(KEY, "utf8"))),
});
const db = admin.firestore();
const auth = admin.auth();
console.log("[seed-students] project:", admin.app().options.credential.projectId ?? "unknown");

// ── Read Excel ────────────────────────────────────────────────────────────────
const wb = read(await readFile("./StudentPicsDataset.xlsx"), { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = utils.sheet_to_json(ws, { defval: "" });

console.log(`[seed-students] found ${rows.length} rows in Excel`);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function createOrUpdateAuthUser(email, password, displayName) {
  try {
    const u = await auth.createUser({ email, password, displayName, emailVerified: true });
    return { uid: u.uid, created: true };
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      const u = await auth.getUserByEmail(email);
      await auth.updateUser(u.uid, { password, displayName, emailVerified: true });
      return { uid: u.uid, created: false };
    }
    throw e;
  }
}

// Commit a batch of writes, chunked to stay under the 500-op Firestore limit.
async function commitChunked(ops) {
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────
let created = 0;
let updated = 0;
let failed = 0;
const firestoreOps = [];

for (const row of rows) {
  const studentId = String(row["Student ID"] || "").trim();
  const name = String(row["Student Name"] || "").trim();
  const photoUrl = String(row["Photo Link"] || "").trim();

  if (!studentId || !name) {
    console.warn("  [skip] missing Student ID or Name:", row);
    failed++;
    continue;
  }

  const email = `${studentId}@students.nada.edu`;
  const password = `Nada@${studentId}`;

  try {
    const { uid, created: wasCreated } = await createOrUpdateAuthUser(email, password, name);

    if (wasCreated) created++;
    else updated++;

    // students/{studentId} — use university ID as doc ID for easy cross-reference
    const studentRef = db.collection("students").doc(studentId);
    firestoreOps.push({
      ref: studentRef,
      data: {
        student_id: studentId,
        name,
        email,
        photo_url: photoUrl || null,
        active: true,
        created_at: admin.firestore.Timestamp.now(),
      },
    });

    // users/{uid} — role mapping
    const userRef = db.collection("users").doc(uid);
    firestoreOps.push({
      ref: userRef,
      data: {
        uid,
        role: "student",
        linked_id: studentId,
      },
    });

    process.stdout.write(`\r  processed ${created + updated + failed}/${rows.length}`);
  } catch (e) {
    console.error(`\n  [error] ${studentId} (${name}):`, e.message);
    failed++;
  }
}

process.stdout.write("\n");
console.log("[seed-students] writing Firestore docs…");
await commitChunked(firestoreOps);

console.log(`
[seed-students] done!
  Auth users created : ${created}
  Auth users updated : ${updated}
  Failed             : ${failed}
  Firestore ops      : ${firestoreOps.length}
`);
