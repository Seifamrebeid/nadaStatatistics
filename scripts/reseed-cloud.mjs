// Wipes and reseeds the REAL Firebase project (fridgechef-jt50c).
// Deletes all docs from the core collections, then recreates Auth users +
// Firestore docs from scratch using the service account.
//
// Usage:
//   node scripts/reseed-cloud.mjs
//
// Options:
//   --key <path>   service-account JSON (default: ./firebaseservice_account.json)
//   --no-clear     skip the delete step (add data without wiping first)

import admin from "firebase-admin";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// ── init ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const KEY = argv[argv.indexOf("--key") + 1] || "./firebaseservice_account.json";
const SKIP_CLEAR = argv.includes("--no-clear");

if (!existsSync(KEY)) {
  console.error(`Service-account not found: ${KEY}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(await readFile(KEY, "utf8"))),
});
const db   = admin.firestore();
const auth = admin.auth();
console.log("[reseed] project:", admin.app().options.credential.projectId ?? "unknown");

// ── helpers ───────────────────────────────────────────────────────────────────
const newId = (p) => `${p}_${Math.random().toString(16).slice(2, 10)}`;
const now   = () => admin.firestore.Timestamp.now();

async function deleteCollection(name) {
  let total = 0;
  while (true) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    process.stdout.write(`\r  clearing ${name}: ${total}`);
  }
  if (total) process.stdout.write("\n");
  return total;
}

async function createAuthUser(email, password, displayName) {
  try {
    const u = await auth.createUser({ email, password, displayName, emailVerified: true });
    return u.uid;
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      // fetch existing uid so Firestore docs stay in sync
      const u = await auth.getUserByEmail(email);
      // update password in case it changed
      await auth.updateUser(u.uid, { password, displayName, emailVerified: true });
      return u.uid;
    }
    throw e;
  }
}

// ── 1. clear ──────────────────────────────────────────────────────────────────
const COLLECTIONS = [
  "users", "admins", "doctors", "students", "parents",
  "subjects", "classes", "weeks", "lectures",
  "emotions", "grades", "notifications",
];

if (!SKIP_CLEAR) {
  console.log("[reseed] clearing collections…");
  for (const c of COLLECTIONS) await deleteCollection(c);
  console.log("[reseed] collections cleared.");
} else {
  console.log("[reseed] --no-clear: skipping delete step.");
}

// ── 2. admin account ──────────────────────────────────────────────────────────
console.log("\n[reseed] creating admin…");
const ADMIN_EMAIL = "admin@classroom.local";
const ADMIN_PASS  = "admin-password-change-me";

const adminUid = await createAuthUser(ADMIN_EMAIL, ADMIN_PASS, "Admin");
const adminId  = newId("adm");
const ts       = now();

await db.collection("admins").doc(adminId).set({
  admin_id:   adminId,
  name:       "Admin",
  email:      ADMIN_EMAIL,
  created_at: ts,
});
await db.collection("users").doc(adminUid).set({
  uid:        adminUid,
  role:       "admin",
  linked_id:  adminId,
  email:      ADMIN_EMAIL,
});
console.log(`  admin: ${ADMIN_EMAIL}  uid=${adminUid}  doc=${adminId}`);

// ── 3. doctors + curriculum ────────────────────────────────────────────────────
console.log("\n[reseed] creating doctors + curriculum…");

const DOCTOR_PASS = "Doctor@123";
const TERM_START  = new Date("2026-05-10T00:00:00Z"); // Sunday
const NUM_WEEKS   = 16;
const SECTIONS    = ["SE1", "SE2", "SE3", "SE4", "SE5"];

const SUBJECTS = [
  {
    name: "Computing Algorithms", code: "CS-ALG",
    description: "Design and analysis of computing algorithms.",
    doctor: { name: "Dr. Ahmed Hassan", email: "ahmed.haessan@nada.edu", department: "Computer Science" },
    dayOfWeek: 0, startTime: "09:00", endTime: "11:00",
  },
  {
    name: "Professional Training In AI", code: "AI-PT",
    description: "Hands-on professional training in modern AI.",
    doctor: { name: "Dr. Mona Saeed", email: "mona.saeeed@nada.edu", department: "Artificial Intelligence" },
    dayOfWeek: 2, startTime: "11:00", endTime: "13:00",
  },
  {
    name: "Advanced Statistics", code: "STAT-ADV",
    description: "Advanced statistical inference and modelling.",
    doctor: { name: "Dr. Khaled Mostafa", email: "khaled.mostafa@nada.edu", department: "Statistics" },
    dayOfWeek: 3, startTime: "13:00", endTime: "15:00",
  },
];

function weekDate(weekNum, dayOfWeek) {
  const d = new Date(TERM_START);
  d.setUTCDate(d.getUTCDate() + (weekNum - 1) * 7 + dayOfWeek);
  return d;
}
function isoDateTime(d, time) {
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}T${time}:00Z`;
}

for (const subj of SUBJECTS) {
  // doctor
  const doctorUid = await createAuthUser(subj.doctor.email, DOCTOR_PASS, subj.doctor.name);
  const doctorId  = newId("doc");
  await db.collection("doctors").doc(doctorId).set({
    doctor_id:  doctorId,
    name:       subj.doctor.name,
    email:      subj.doctor.email,
    department: subj.doctor.department,
    active:     true,
    created_at: ts,
  });
  await db.collection("users").doc(doctorUid).set({
    uid:       doctorUid,
    role:      "doctor",
    linked_id: doctorId,
    email:     subj.doctor.email,
  });
  console.log(`  doctor: ${subj.doctor.name}  uid=${doctorUid}  doc=${doctorId}`);

  // subject
  const subjectId = newId("sub");
  await db.collection("subjects").doc(subjectId).set({
    subject_id:     subjectId,
    doctor_id:      doctorId,
    name:           subj.name,
    code:           subj.code,
    description:    subj.description,
    active:         true,
    created_by:     adminUid,
    created_at:     ts,
  });

  // classes + weeks
  for (const section of SECTIONS) {
    const classId = newId("cls");
    await db.collection("classes").doc(classId).set({
      class_id:             classId,
      subject_id:           subjectId,
      name:                 `${subj.code} ${section}`,
      section,
      academic_year:        "2026",
      term:                 "Spring 2026",
      enrolled_student_ids: [],
      active:               true,
      created_by:           adminUid,
      created_at:           ts,
    });

    const weekBatch = db.batch();
    for (let w = 1; w <= NUM_WEEKS; w++) {
      const d      = weekDate(w, subj.dayOfWeek);
      const weekId = newId("wk");
      weekBatch.set(db.collection("weeks").doc(weekId), {
        week_id:          weekId,
        class_id:         classId,
        week_number:      w,
        title:            `Week ${w}`,
        date:             isoDateTime(d, subj.startTime),
        scheduled_start:  isoDateTime(d, subj.startTime),
        scheduled_end:    isoDateTime(d, subj.endTime),
        status:           "planned",
        active:           true,
        created_by:       adminUid,
        created_at:       ts,
      });
    }
    await weekBatch.commit();
    console.log(`    class ${section} (${classId}) + ${NUM_WEEKS} weeks`);
  }
}

// ── 4. student — nada ─────────────────────────────────────────────────────────
console.log("\n[reseed] creating student (nada)…");
const STUDENT_EMAIL = "nadasoska2005@gmail.com";
const STUDENT_PASS  = "123456789";

const studentUid = await createAuthUser(STUDENT_EMAIL, STUDENT_PASS, "Nada");
const studentId  = newId("stu");
await db.collection("students").doc(studentId).set({
  student_id:  studentId,
  name:        "Nada",
  email:       STUDENT_EMAIL,
  active:      true,
  created_by:  adminUid,
  created_at:  ts,
});
await db.collection("users").doc(studentUid).set({
  uid:       studentUid,
  role:      "student",
  linked_id: studentId,
  email:     STUDENT_EMAIL,
});
console.log(`  student: ${STUDENT_EMAIL}  uid=${studentUid}  doc=${studentId}`);

// ── done ──────────────────────────────────────────────────────────────────────
console.log(`
[reseed] done.

Credentials
───────────────────────────────────────────────
Admin    admin@classroom.local         admin-password-change-me
Doctor   ahmed.haessan@nada.edu        Doctor@123
Doctor   mona.saeeed@nada.edu          Doctor@123
Doctor   khaled.mostafa@nada.edu       Doctor@123
Student  nadasoska2005@gmail.com       123456789
───────────────────────────────────────────────
`);
