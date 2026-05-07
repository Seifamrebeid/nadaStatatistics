// One-shot: restore auth users, restore Firestore docs, dedupe duplicates.
// Run this whenever the emulator comes up empty — it gets you back to the
// canonical clean state in ~30 seconds.
//
// Usage: node scripts/setup-data.mjs
//
// What it does:
//   1) restore-auth.mjs       — seeds 8 users from seed/auth_export/accounts.json
//   2) restore-firestore.mjs  — seeds 1399 docs from backup/firestore-backup.json
//   3) dedupe-firestore.mjs   — drops duplicate subjects/classes/weeks/doctors
//                               that aren't referenced by any lecture
//
// Each step is idempotent — re-running it is safe.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function run(script) {
  return new Promise((resolve, reject) => {
    const path = join(here, script);
    console.log(`\n──── ${script} ────`);
    const child = spawn(process.execPath, [path], { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
  });
}

async function checkEmulator() {
  try {
    const r = await fetch("http://localhost:8080/");
    return r.ok;
  } catch {
    return false;
  }
}

const up = await checkEmulator();
if (!up) {
  console.error("Firestore emulator is not reachable on http://localhost:8080.");
  console.error("Start it first:  .\\scripts\\start-emulators.ps1");
  process.exit(1);
}

await run("restore-auth.mjs");
await run("restore-firestore.mjs");
await run("dedupe-firestore.mjs");

console.log("\n✓ data setup complete.");
