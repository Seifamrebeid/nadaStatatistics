// Seeds curriculum into the running Firebase emulator.
// Usage: node scripts/seed-curriculum.mjs

const PROJECT = process.env.FIREBASE_PROJECT_ID || "emotion-detection-dev";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = `http://localhost:9099/identitytoolkit.googleapis.com/v1`;
const FS_HEADERS = {
  Authorization: "Bearer owner",
  "Content-Type": "application/json",
};

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const newId = (p) => `${p}_${Math.random().toString(16).slice(2, 12)}`;

// Firestore typed-value encoder.
function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = encode(val);
    return { mapValue: { fields } };
  }
  throw new Error(`unsupported value: ${v}`);
}

function fields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = encode(v);
  }
  return out;
}

async function fsCreate(collection, docId, data) {
  const url = `${FS}/${collection}?documentId=${encodeURIComponent(docId)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: FS_HEADERS,
    body: JSON.stringify({ fields: fields(data) }),
  });
  if (r.status === 409) {
    // upsert via PATCH
    const p = await fetch(`${FS}/${collection}/${encodeURIComponent(docId)}`, {
      method: "PATCH",
      headers: FS_HEADERS,
      body: JSON.stringify({ fields: fields(data) }),
    });
    if (!p.ok)
      throw new Error(
        `upsert ${collection}/${docId}: ${p.status} ${await p.text()}`,
      );
    return p.json();
  }
  if (!r.ok)
    throw new Error(
      `create ${collection}/${docId}: ${r.status} ${await r.text()}`,
    );
  return r.json();
}

async function authSignUp(email, password, displayName) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      displayName,
      returnSecureToken: true,
    }),
  });
  if (r.ok) return (await r.json()).localId;
  const text = await r.text();
  if (text.includes("EMAIL_EXISTS")) {
    const signIn = await fetch(`${AUTH}/accounts:signInWithPassword?key=fake-api-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    if (!signIn.ok) throw new Error(`signIn ${email}: ${signIn.status} ${await signIn.text()}`);
    return (await signIn.json()).localId;
  }
  throw new Error(`signUp ${email}: ${r.status} ${text}`);
}

// ---- Curriculum spec ----
const SUBJECTS = [
  {
    name: "Computing Algorithms",
    code: "CS-ALG",
    description: "Design and analysis of computing algorithms.",
    doctor: {
      name: "Dr. Ahmed Hassan",
      email: "ahmed.haessan@nada.edu",
      department: "Computer Science",
    },
    schedule: { dayOfWeek: 0, startTime: "09:00", endTime: "11:00" }, // Sunday
  },
  {
    name: "Professional Training In AI",
    code: "AI-PT",
    description: "Hands-on professional training in modern AI.",
    doctor: {
      name: "Dr. Mona Saeed",
      email: "mona.saeeed@nada.edu",
      department: "Artificial Intelligence",
    },
    schedule: { dayOfWeek: 2, startTime: "11:00", endTime: "13:00" }, // Tuesday
  },
  {
    name: "Advanced Statistics",
    code: "STAT-ADV",
    description: "Advanced statistical inference and modelling.",
    doctor: {
      name: "Dr. Khaled Mostafa",
      email: "khaled.mostafa@nada.edu",
      department: "Statistics",
    },
    schedule: { dayOfWeek: 3, startTime: "13:00", endTime: "15:00" }, // Wednesday
  },
];

const SECTIONS = ["SE1", "SE2", "SE3", "SE4", "SE5"];
const ACADEMIC_YEAR = "2026";
const TERM = "Spring 2026";
const TERM_START = new Date("2026-05-10T00:00:00Z"); // Sunday
const NUM_WEEKS = 16;
const PASSWORD = "Doctor@123";

// Returns the date of the given weekday (0=Sun..6=Sat) in week N (1-indexed) starting from termStart (a Sunday).
function weekDate(weekNumber, dayOfWeek) {
  const d = new Date(TERM_START);
  d.setUTCDate(d.getUTCDate() + (weekNumber - 1) * 7 + dayOfWeek);
  return d;
}

function iso(d, time) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${time}:00Z`;
}

async function main() {
  const ts = nowIso();
  console.log(
    `[seed] project=${PROJECT}  start=${TERM_START.toISOString().slice(0, 10)}  weeks=${NUM_WEEKS}`,
  );

  for (const subj of SUBJECTS) {
    // 1) Doctor — auth user + doctors/<id> + users/<uid>
    const doctorId = newId("doc");
    const uid = await authSignUp(subj.doctor.email, PASSWORD, subj.doctor.name);
    await fsCreate("doctors", doctorId, {
      doctor_id: doctorId,
      name: subj.doctor.name,
      email: subj.doctor.email,
      department: subj.doctor.department,
      active: true,
      created_at: ts,
    });
    await fsCreate("users", uid, {
      uid,
      role: "doctor",
      linked_id: doctorId,
      email: subj.doctor.email,
    });
    console.log(`  doctor: ${subj.doctor.name}  (${doctorId})`);

    // 2) Subject
    const subjectId = newId("sub");
    await fsCreate("subjects", subjectId, {
      subject_id: subjectId,
      doctor_id: doctorId,
      name: subj.name,
      code: subj.code,
      description: subj.description,
      schedule_day: subj.schedule.dayOfWeek,
      schedule_start: subj.schedule.startTime,
      schedule_end: subj.schedule.endTime,
      active: true,
      created_at: ts,
    });
    console.log(`  subject: ${subj.name}  (${subjectId})`);

    // 3) Classes SE1..SE5 + 16 weeks each
    for (const section of SECTIONS) {
      const classId = newId("cls");
      await fsCreate("classes", classId, {
        class_id: classId,
        subject_id: subjectId,
        name: `${subj.code} ${section}`,
        section,
        academic_year: ACADEMIC_YEAR,
        term: TERM,
        enrolled_student_ids: [],
        active: true,
        created_at: ts,
      });

      for (let w = 1; w <= NUM_WEEKS; w++) {
        const date = weekDate(w, subj.schedule.dayOfWeek);
        const weekId = newId("wk");
        await fsCreate("weeks", weekId, {
          week_id: weekId,
          class_id: classId,
          week_number: w,
          title: `Week ${w}`,
          date: iso(date, subj.schedule.startTime),
          scheduled_start: iso(date, subj.schedule.startTime),
          scheduled_end: iso(date, subj.schedule.endTime),
          status: "planned",
          active: true,
          created_at: ts,
        });
      }
      console.log(`    class: ${section}  (${classId})  +${NUM_WEEKS} weeks`);
    }
  }

  console.log("[seed] done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
