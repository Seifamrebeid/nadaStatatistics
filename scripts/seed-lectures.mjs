// Creates one lecture doc per week for every class in every course.
// Reads weeks/classes/subjects from the real Firebase project via Admin SDK.
//
// Usage:
//   node scripts/seed-lectures.mjs
//
// Options:
//   --key <path>   service-account JSON (default: ./firebaseservice_account.json)
//   --no-clear     skip deleting existing lectures first

import admin from "firebase-admin";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const argv      = process.argv.slice(2);
const KEY       = argv[argv.indexOf("--key") + 1] || "./firebaseservice_account.json";
const SKIP_CLEAR = argv.includes("--no-clear");

if (!existsSync(KEY)) {
  console.error(`Service-account not found: ${KEY}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(await readFile(KEY, "utf8"))),
});
const db = admin.firestore();
console.log("[seed-lectures] project:", admin.app().options.credential.projectId ?? "unknown");

const newId = (p) => `${p}_${Math.random().toString(16).slice(2, 10)}`;
const ts    = admin.firestore.Timestamp.now();

// ── clear existing lectures ───────────────────────────────────────────────────
if (!SKIP_CLEAR) {
  console.log("[seed-lectures] clearing existing lectures…");
  let total = 0;
  while (true) {
    const snap = await db.collection("lectures").limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    process.stdout.write(`\r  cleared ${total}`);
  }
  if (total) process.stdout.write("\n");
} else {
  console.log("[seed-lectures] --no-clear: keeping existing lectures.");
}

// ── load source data ──────────────────────────────────────────────────────────
console.log("[seed-lectures] loading data…");
const [weeksSnap, classesSnap, subjectsSnap] = await Promise.all([
  db.collection("weeks").get(),
  db.collection("classes").get(),
  db.collection("subjects").get(),
]);

const weeks       = weeksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const classById   = Object.fromEntries(classesSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
const subjectById = Object.fromEntries(subjectsSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

console.log(`  ${weeks.length} weeks across ${classesSnap.size} classes in ${subjectsSnap.size} subjects`);

// ── create one lecture per week ───────────────────────────────────────────────
console.log("[seed-lectures] creating lectures…");

let count      = 0;
let skipped    = 0;
let batch      = db.batch();
let batchCount = 0;

async function flushBatch() {
  if (batchCount === 0) return;
  await batch.commit();
  batch = db.batch();
  batchCount = 0;
}

for (const week of weeks) {
  const cls  = classById[week.class_id];
  if (!cls) { skipped++; continue; }

  const subj = subjectById[cls.subject_id];
  if (!subj || !subj.doctor_id) { skipped++; continue; }

  const lectureId  = newId("lec");
  const sectionTag = cls.section ? ` (${cls.section})` : "";

  batch.set(db.collection("lectures").doc(lectureId), {
    lecture_id:           lectureId,
    week_id:              week.id,
    class_id:             week.class_id,
    subject_id:           cls.subject_id,
    doctor_id:            subj.doctor_id,
    title:                `${subj.name} — Week ${week.week_number ?? "?"}${sectionTag}`,
    week_number:          week.week_number          ?? null,
    date:                 week.date                 ?? null,
    scheduled_start:      week.scheduled_start      ?? null,
    scheduled_end:        week.scheduled_end        ?? null,
    status:               "scheduled",
    enrolled_student_ids: Array.isArray(cls.enrolled_student_ids) ? cls.enrolled_student_ids : [],
    active:               true,
    created_at:           ts,
  });

  // back-link the week to its lecture
  batch.update(db.collection("weeks").doc(week.id), { lecture_id: lectureId });

  count++;
  batchCount += 2; // two ops per iteration

  if (batchCount >= 400) {
    await flushBatch();
    process.stdout.write(`\r  created ${count}…`);
  }
}

await flushBatch();

console.log(`
[seed-lectures] done.

  lectures created : ${count}
  weeks skipped    : ${skipped} (missing class or subject)
`);
