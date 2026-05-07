// Imports the auth users from accounts.json into the running emulator,
// preserving their original localIds so users/<uid> Firestore docs still match.
// Usage: node scripts/restore-auth.mjs [accounts.json] [project]

import { readFile } from "node:fs/promises";

const IN = process.argv[2] || "./firebase-emulator/seed/auth_export/accounts.json";
const PROJECT = process.argv[3] || "emotion-detection-dev";
const URL = `http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchCreate?key=fake-api-key`;

const data = JSON.parse(await readFile(IN, "utf8"));
const users = (data.users || []).map((u) => ({
  localId: u.localId,
  email: u.email,
  emailVerified: !!u.emailVerified,
  displayName: u.displayName,
  passwordHash: u.passwordHash,
  salt: u.salt,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
  providerUserInfo: u.providerUserInfo || [],
}));

const r = await fetch(URL, {
  method: "POST",
  headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
  body: JSON.stringify({ users, hashAlgorithm: "BCRYPT" /* ignored in emulator */ }),
});
const text = await r.text();
console.log("status:", r.status, text.slice(0, 400));
