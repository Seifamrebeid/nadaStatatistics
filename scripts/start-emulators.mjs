// Launch the Firebase emulator suite and replay the JSON backup so the new
// instance has all the doctors / classes / lectures / users from the last
// session. Replaces the legacy --import=./seed flow when you want a single
// source of truth (the JSON backups in firebase-emulator/backup/).
//
// Usage:
//   node scripts/start-emulators.mjs               # restore from default backup
//   node scripts/start-emulators.mjs --no-restore  # boot empty
//   node scripts/start-emulators.mjs --no-auth     # firestore only
//
// Flow:
//   1. spawn `firebase emulators:start` from firebase-emulator/
//   2. poll Auth + Firestore ports until they answer
//   3. run restore-firestore + restore-auth against the running emulator
//   4. forward SIGINT/SIGTERM so Ctrl+C cleanly stops the emulator

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const EMU_DIR = resolve(REPO, "firebase-emulator");

const FIRESTORE_BACKUP = resolve(REPO, "firebase-emulator/backup/firestore-backup.json");
const AUTH_BACKUP      = resolve(REPO, "firebase-emulator/backup/auth-backup.json");
const PROJECT          = process.env.FIREBASE_PROJECT_ID || "fridgechef-jt50c";

const args = new Set(process.argv.slice(2));
const SKIP_RESTORE = args.has("--no-restore");
const SKIP_AUTH    = args.has("--no-auth");

const FIRESTORE = "http://127.0.0.1:8080";
const AUTH      = "http://127.0.0.1:9099";

function log(msg) { console.log(`[start] ${msg}`); }

async function ping(url) {
  try {
    const r = await fetch(url, { method: "GET" });
    return r.status;
  } catch { return 0; }
}

async function waitFor(url, label, timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await ping(url);
    if (s >= 200 && s < 600) { log(`${label} ready (HTTP ${s})`); return true; }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`${label} did not become ready in ${timeoutMs / 1000}s`);
}

function runNode(scriptPath, scriptArgs = []) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: REPO, stdio: "inherit", env: process.env,
    });
    child.on("exit", (code) =>
      code === 0 ? resolveP() : rejectP(new Error(`${scriptPath} exit ${code}`))
    );
    child.on("error", rejectP);
  });
}

// ---- spawn the emulator ------------------------------------------------
// --import + --export-on-exit point at firebase-emulator/snapshot/ so every
// restart picks up the previous state for ALL services (Firestore + Auth +
// Storage). The legacy JSON backup pipeline below still runs as a fallback
// and for grep-friendly archives.
const SNAPSHOT_DIR = resolve(EMU_DIR, "snapshot");
// Treat snapshot as usable only when it exists AND has the firebase-export-
// metadata.json marker file the emulator writes on a successful export.
const haveSnapshot = existsSync(SNAPSHOT_DIR) &&
  existsSync(resolve(SNAPSHOT_DIR, "firebase-export-metadata.json"));
log(`spawning Firebase emulators in ${EMU_DIR} (project=${PROJECT})`);
log(`snapshot dir: ${SNAPSHOT_DIR}  (${haveSnapshot ? "found, will import" : "missing, fresh start"})`);
const isWin = process.platform === "win32";
const emuArgs = ["firebase-tools", "emulators:start", "--project", PROJECT,
                 "--export-on-exit", SNAPSHOT_DIR];
if (haveSnapshot) emuArgs.push("--import", SNAPSHOT_DIR);
if (args.has("--no-restore")) {
  // Skip both: don't import, don't export. Useful for clean tests.
  for (const flag of ["--import", "--export-on-exit"]) {
    const i = emuArgs.indexOf(flag);
    if (i >= 0) emuArgs.splice(i, 2);
  }
}
const emu = spawn(
  isWin ? "npx.cmd" : "npx",
  emuArgs,
  { cwd: EMU_DIR, stdio: "inherit", shell: isWin }
);

emu.on("exit", (code, signal) => {
  log(`emulator exited (code=${code}, signal=${signal})`);
  process.exit(code ?? 0);
});
emu.on("error", (e) => {
  console.error(`[start] failed to launch firebase CLI: ${e.message}`);
  console.error("        is `npx` installed and on PATH? It should come with Node.js.");
  process.exit(1);
});

let shuttingDown = false;
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${sig}, saving data before shutdown…`);
    try {
      await runNode(resolve(__dirname, "backup-firestore.mjs"));
      await runNode(resolve(__dirname, "backup-auth.mjs"));
      log("backup complete");
    } catch (e) {
      console.error(`[start] backup failed: ${e.message}`);
    }
    log("stopping emulator…");
    emu.kill(sig);
  });
}

// ---- wait for the emulator + restore data ------------------------------
try {
  await waitFor(FIRESTORE, "Firestore");
  if (!SKIP_AUTH) await waitFor(AUTH, "Auth");

  if (SKIP_RESTORE) {
    log("--no-restore set, skipping data replay");
  } else {
    if (existsSync(FIRESTORE_BACKUP)) {
      log(`restoring Firestore from ${FIRESTORE_BACKUP}`);
      await runNode(resolve(__dirname, "restore-firestore.mjs"), [FIRESTORE_BACKUP, PROJECT]);
    } else {
      log(`no Firestore backup at ${FIRESTORE_BACKUP} — run \`node scripts/backup-firestore.mjs\` first`);
    }

    if (!SKIP_AUTH) {
      if (existsSync(AUTH_BACKUP)) {
        log(`restoring Auth from ${AUTH_BACKUP}`);
        await runNode(resolve(__dirname, "restore-auth.mjs"), [AUTH_BACKUP, PROJECT]);
      } else {
        log(`no Auth backup at ${AUTH_BACKUP} — run \`node scripts/backup-auth.mjs\` first`);
      }
    }
  }

  log("ready. Ctrl+C to stop the emulator.");
} catch (e) {
  console.error(`[start] ${e.message}`);
  emu.kill("SIGINT");
  process.exit(1);
}
