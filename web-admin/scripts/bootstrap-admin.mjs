// Create the first admin account in the emulator so you can sign in.
// Run once per fresh seed:  npm run bootstrap-admin
//
// Steps:
//   1. POST to the Auth emulator to create (or look up) the Auth user
//   2. PATCH users/<uid> so the backend's role lookup returns role=admin
//   3. PATCH admins/<admin_id> for traceability
//
// Re-runs are idempotent (Auth will error EMAIL_EXISTS on step 1; we catch
// it and look up the uid instead).

const EMAIL    = process.env.ADMIN_EMAIL    || "admin@classroom.local";
const PASSWORD = process.env.ADMIN_PASSWORD || "admin-password-change-me";
const PROJECT  = process.env.PROJECT_ID     || "emotion-detection-dev";
const AUTH_HOST      = process.env.AUTH_HOST      || "127.0.0.1:9099";
const FIRESTORE_HOST = process.env.FIRESTORE_HOST || "127.0.0.1:8080";

const AUTH_BASE = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
const FS_BASE   = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

async function createOrLookupAuth() {
  // Try signUp first.
  let resp = await fetch(`${AUTH_BASE}/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  });
  if (resp.ok) {
    const data = await resp.json();
    return { uid: data.localId, created: true };
  }
  const err = await resp.json();
  if (err?.error?.message === "EMAIL_EXISTS") {
    // Already exists — sign in to get the uid.
    resp = await fetch(`${AUTH_BASE}/accounts:signInWithPassword?key=fake-api-key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    });
    if (!resp.ok) throw new Error(`signIn failed (wrong password?): ${await resp.text()}`);
    const data = await resp.json();
    return { uid: data.localId, created: false };
  }
  throw new Error(`signUp failed: ${JSON.stringify(err)}`);
}

async function seedFirestoreDoc(path, fields) {
  const resp = await fetch(`${FS_BASE}/${path}`, {
    method: "PATCH",
    headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) throw new Error(`Firestore PATCH ${path}: ${await resp.text()}`);
}

function str(v) { return { stringValue: v }; }

async function main() {
  const { uid, created } = await createOrLookupAuth();
  const adminId = "admin_001";

  await seedFirestoreDoc(`users/${uid}`, {
    uid:       str(uid),
    role:      str("admin"),
    linked_id: str(adminId),
    email:     str(EMAIL),
  });
  await seedFirestoreDoc(`admins/${adminId}`, {
    admin_id: str(adminId),
    name:     str("Root Admin"),
    email:    str(EMAIL),
  });

  console.log(`✓ admin ready (${created ? "created" : "already existed"})`);
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  uid:      ${uid}`);
  console.log(`  linked:   admins/${adminId}`);
}

main().catch((e) => { console.error("bootstrap-admin failed:", e.message); process.exit(1); });
