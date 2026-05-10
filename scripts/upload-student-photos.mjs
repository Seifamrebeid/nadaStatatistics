// Bulk-upload student face photos to Firebase Storage and patch each
// student's `face_photo_url` in Firestore.
//
// Usage:
//
//   # 1. Use real photos from a folder. File names must match student IDs:
//   #      data/student_photos/231004095.jpg
//   #      data/student_photos/231004160.png
//   node scripts/upload-student-photos.mjs --from data/student_photos
//
//   # 2. Generate avatars (DiceBear) for every student that doesn't already
//   #    have a face_photo_url. Great for demos when you don't have real photos.
//   node scripts/upload-student-photos.mjs --generate
//
//   # 3. Combine: upload real photos where available, generate the rest.
//   node scripts/upload-student-photos.mjs --from data/student_photos --generate
//
//   # 4. Force overwrite even if a student already has a photo URL.
//   node scripts/upload-student-photos.mjs --generate --force
//
// Targets the Firebase emulator by default (Storage on :9199, Firestore on :8080).
// Set FIREBASE_STORAGE_EMULATOR_HOST="" to push to production storage.

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, basename } from "node:path";

const PROJECT = process.env.FIREBASE_PROJECT_ID || "fridgechef-jt50c";
const BUCKET  = process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT}.firebasestorage.app`;
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const STORAGE = process.env.FIREBASE_STORAGE_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`
  : "http://localhost:9199";
const H_FS = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const H_ST = { Authorization: "Bearer owner" };

// ── flags ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  return args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
};
const FROM     = typeof flag("from") === "string" ? flag("from") : null;
const GENERATE = !!flag("generate");
const FORCE    = !!flag("force");
const STYLE    = (typeof flag("style") === "string" ? flag("style") : "avataaars");

if (!FROM && !GENERATE) {
  console.error("usage: --from <dir> AND/OR --generate  (run with -h for help)");
  process.exit(1);
}

// ── encoders ───────────────────────────────────────────────────────────
const encode = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = encode(val);
    return { mapValue: { fields } };
  }
  throw new Error(`unsupported value: ${v}`);
};
const decode = (f) => {
  if (!f) return null;
  if (f.nullValue !== undefined) return null;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return Number(f.doubleValue);
  if (f.timestampValue !== undefined) return f.timestampValue;
  if (f.arrayValue) return (f.arrayValue.values || []).map(decode);
  if (f.mapValue) {
    const o = {};
    for (const [k, v] of Object.entries(f.mapValue.fields || {})) o[k] = decode(v);
    return o;
  }
  return null;
};

// ── Firestore ──────────────────────────────────────────────────────────
async function listAll(coll) {
  const out = []; let token = null;
  while (true) {
    const url = new URL(`${FS}/${coll}`);
    url.searchParams.set("pageSize", "300");
    if (token) url.searchParams.set("pageToken", token);
    const r = await fetch(url, { headers: H_FS });
    if (!r.ok) throw new Error(`list ${coll} HTTP ${r.status}`);
    const j = await r.json();
    for (const d of j.documents || []) {
      const id = d.name.split("/").pop();
      const flat = {}; for (const [k, v] of Object.entries(d.fields || {})) flat[k] = decode(v);
      flat._id = id; out.push(flat);
    }
    token = j.nextPageToken; if (!token) break;
  }
  return out;
}

async function patchStudent(id, patch) {
  const masks = Object.keys(patch).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const url = `${FS}/students/${encodeURIComponent(id)}?${masks}`;
  const fields = {}; for (const [k, v] of Object.entries(patch)) fields[k] = encode(v);
  const r = await fetch(url, { method: "PATCH", headers: H_FS, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`patch ${id} HTTP ${r.status}: ${await r.text()}`);
}

// ── Storage ────────────────────────────────────────────────────────────
// Upload a binary blob to gs://<bucket>/<objectPath>. The Storage emulator
// accepts the standard Cloud Storage upload endpoint.
async function uploadBuffer(objectPath, buf, contentType) {
  const url = `${STORAGE}/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { ...H_ST, "Content-Type": contentType, "Content-Length": String(buf.length) },
    body: buf,
  });
  if (!r.ok) throw new Error(`upload ${objectPath} HTTP ${r.status}: ${await r.text()}`);
  // Build the Firebase-style download URL. Emulator uses the v0 path.
  return `${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

// ── Helpers ────────────────────────────────────────────────────────────
const mimeFor = (path) => {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
};

// Cache the student_id -> filename map per directory so we only scan once.
const _dirCache = new Map();

async function buildPhotoIndex(dir) {
  if (_dirCache.has(dir)) return _dirCache.get(dir);
  const files = await readdir(dir);
  const idx = new Map();
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) continue;
    // Accept either "<id>.jpg" OR "<id>_<anything>.jpg" — the segment up to
    // the first underscore (or dot) is treated as the student id.
    const stem = basename(f, ext);
    const id = stem.split(/[_\s]/, 1)[0];
    if (!id) continue;
    if (!idx.has(id)) idx.set(id, f);     // first match wins
  }
  _dirCache.set(dir, idx);
  console.log(`[photos] indexed ${idx.size} photo(s) in ${dir}`);
  return idx;
}

async function readLocalPhoto(dir, studentId) {
  const idx = await buildPhotoIndex(dir);
  const fname = idx.get(String(studentId));
  if (!fname) return null;
  const p = join(dir, fname);
  return { buf: await readFile(p), contentType: mimeFor(p), srcName: fname };
}

async function fetchAvatar(studentId) {
  // DiceBear v9 — deterministic per seed, returns SVG by default. Use PNG.
  const url = `https://api.dicebear.com/9.x/${STYLE}/png?seed=${encodeURIComponent(studentId)}&size=256`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`avatar ${studentId} HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return { buf, contentType: "image/png" };
}

// ── Main ───────────────────────────────────────────────────────────────
const main = async () => {
  console.log(`[photos] project=${PROJECT}  bucket=${BUCKET}`);
  console.log(`[photos] storage=${STORAGE}`);
  console.log(`[photos] mode: ${FROM ? `disk(${FROM})` : ""}${FROM && GENERATE ? " + " : ""}${GENERATE ? "generate" : ""}${FORCE ? "  [FORCE overwrite]" : ""}`);

  const students = await listAll("students");
  console.log(`[photos] ${students.length} students total`);

  let uploaded = 0, skipped = 0, failed = 0, fromDisk = 0, fromGen = 0;
  let i = 0;
  for (const s of students) {
    i++;
    const sid = s._id;
    if (!FORCE && s.face_photo_url) { skipped++; continue; }

    let payload = null;
    if (FROM) payload = await readLocalPhoto(FROM, sid);
    if (!payload && GENERATE) {
      try { payload = await fetchAvatar(sid); fromGen++; }
      catch (e) { console.error(`  ${sid}: avatar fetch failed: ${e.message}`); failed++; continue; }
    } else if (payload) {
      fromDisk++;
    }
    if (!payload) { skipped++; continue; }

    try {
      const objPath = `students/${sid}/face.${payload.contentType.split("/")[1].replace("jpeg","jpg")}`;
      const url = await uploadBuffer(objPath, payload.buf, payload.contentType);
      await patchStudent(sid, { face_photo_url: url });
      uploaded++;
      if (uploaded % 10 === 0) console.log(`  …${uploaded} uploaded so far  (${i}/${students.length})`);
    } catch (e) {
      console.error(`  ${sid}: upload/patch failed: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n[photos] done. uploaded=${uploaded}  skipped=${skipped}  failed=${failed}`);
  console.log(`         from disk=${fromDisk}  generated=${fromGen}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
