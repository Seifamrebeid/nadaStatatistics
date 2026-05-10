// On-demand snapshot of the running Firebase emulator data.
//
// Saves Firestore + Auth via the proven JSON backup path
// (firebase-emulator/backup/*.json). The next `npm run emu:start` will
// auto-restore them.
//
// For Storage (uploaded photos, audio files), the only reliable cross-platform
// method is the emulator's --export-on-exit flow: just Ctrl+C the running
// emulator and restart with `npm run emu:start`. The new start-emulators.mjs
// passes --export-on-exit + --import so this is automatic.
//
// Usage:
//   node scripts/emu-snapshot.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

function log(m) { console.log(`[snap] ${m}`); }

async function runNode(scriptPath) {
  return new Promise((res, rej) => {
    const c = spawn(process.execPath, [scriptPath], {
      cwd: REPO, stdio: "inherit", env: process.env,
    });
    c.on("exit", (code) => code === 0 ? res() : rej(new Error(`${scriptPath} exit ${code}`)));
    c.on("error", rej);
  });
}

async function tryHubStorage() {
  // Best-effort attempt to hit the Hub /_admin/export for storage only.
  // Skips silently if the call fails (it does on some Windows setups).
  try {
    const r = await fetch("http://127.0.0.1:4400/emulators");
    if (!r.ok) return false;
  } catch { return false; }

  const SNAP = resolve(REPO, "firebase-emulator/snapshot")
    .replace(/\\/g, "/")
    .replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
  try {
    const r = await fetch("http://127.0.0.1:4400/_admin/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: SNAP, initiatedBy: "user",
                             firestore: false, auth: false, storage: true }),
    });
    if (!r.ok) {
      log(`(storage hub export failed; that's OK — Ctrl+C the emulator to snapshot Storage too)`);
      return false;
    }
    log(`storage snapshot saved to ${SNAP}`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  log(`saving Firestore + Auth via JSON backup…`);
  await runNode(resolve(__dirname, "backup-firestore.mjs"));
  await runNode(resolve(__dirname, "backup-auth.mjs"));
  log(`JSON backups saved to firebase-emulator/backup/`);

  await tryHubStorage();

  log(`done.`);
  log(`reminder: Storage (photos / audio) is captured automatically when you`);
  log(`          Ctrl+C the emulator. \`npm run emu:start\` will auto-restore it.`);
}

main().catch((e) => { console.error(`[snap] ${e.message}`); process.exit(1); });
