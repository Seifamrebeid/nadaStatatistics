/**
 * Seed a demo transcript with segments into the emulator (or real project).
 * Picks the first lecture that has stu_7c24b5de1b enrolled and creates:
 *   - transcripts/{transcript_id}  (parent doc)
 *   - transcripts/{transcript_id}/segments/{n}  (several demo segments)
 *   - patches lectures/{lecture_id} with transcript_id + status = "finished"
 *
 * Usage:
 *   node scripts/seed-transcripts.mjs                   # emulator default
 *   node scripts/seed-transcripts.mjs fridgechef-jt50c  # production project
 */

const TARGET  = process.argv[2] || "fridgechef-jt50c";
const EMULATOR_HOST = "http://localhost:8080";
const FS = `${EMULATOR_HOST}/v1/projects/${TARGET}/databases/(default)/documents`;
const H  = { Authorization: "Bearer owner", "Content-Type": "application/json" };

const STUDENT_ID = "stu_7c24b5de1b";

// ── Firestore REST helpers ───────────────────────────────────────────────────

async function fsGet(path) {
  const r = await fetch(`${FS}/${path}`, { headers: H });
  if (!r.ok) return null;
  return r.json();
}

async function fsPatch(path, fields, mask) {
  const updateMask = mask ? `?updateMask.fieldPaths=${mask.join("&updateMask.fieldPaths=")}` : "";
  const r = await fetch(`${FS}/${path}${updateMask}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ fields }),
  });
  return r.ok;
}

async function fsCreate(collection, id, fields) {
  const url = id
    ? `${FS}/${collection}?documentId=${encodeURIComponent(id)}`
    : `${FS}/${collection}`;
  const r = await fetch(url, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`fsCreate(${collection}) failed: ${r.status} ${t}`);
  }
  const doc = await r.json();
  return doc.name.split("/").pop();
}

async function runQuery(collectionId, filter) {
  const r = await fetch(`${FS}:runQuery`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: filter,
        limit: 5,
      },
    }),
  });
  if (!r.ok) return [];
  const arr = await r.json();
  return (arr || [])
    .filter((x) => x.document)
    .map((x) => ({ id: x.document.name.split("/").pop(), fields: x.document.fields || {} }));
}

// ── Value helpers ────────────────────────────────────────────────────────────

const sv = (s)   => ({ stringValue: s });
const bv = (b)   => ({ booleanValue: b });
const iv = (n)   => ({ integerValue: String(n) });
const dv = (n)   => ({ doubleValue: n });
const ts = (d)   => ({ timestampValue: d.toISOString() });
const av = (arr) => ({ arrayValue: { values: arr } });

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[seed-transcripts] target=${TARGET}`);

  // Find a lecture the student is enrolled in
  const lectures = await runQuery("lectures", {
    fieldFilter: {
      field: { fieldPath: "enrolled_student_ids" },
      op: "ARRAY_CONTAINS",
      value: sv(STUDENT_ID),
    },
  });

  if (lectures.length === 0) {
    console.error(`No lectures found with ${STUDENT_ID} enrolled. Make sure emulator is running with backup data loaded.`);
    process.exit(1);
  }

  const lec = lectures[0];
  const lectureId = lec.id;
  const lecTitle = lec.fields.title?.stringValue || lectureId;
  console.log(`[seed-transcripts] Using lecture: ${lectureId} — "${lecTitle}"`);

  // Check if this lecture already has a transcript
  if (lec.fields.transcript_id?.stringValue) {
    console.log(`[seed-transcripts] Lecture already has transcript_id=${lec.fields.transcript_id.stringValue}. Skipping.`);
    process.exit(0);
  }

  // Create transcript parent doc
  const now = new Date();
  const transcriptId = `demo_transcript_${Date.now()}`;
  console.log(`[seed-transcripts] Creating transcript doc: ${transcriptId}`);

  await fsCreate(`transcripts`, transcriptId, {
    transcript_id:   sv(transcriptId),
    lecture_id:      sv(lectureId),
    language:        sv("ar"),
    started_at:      ts(new Date(now.getTime() - 40 * 60 * 1000)),
    last_updated_at: ts(now),
    segment_count:   iv(8),
    completed:       bv(true),
  });

  // Patch lecture with transcript_id and set status to finished
  const patched = await fsPatch(`lectures/${lectureId}`, {
    transcript_id: sv(transcriptId),
    status:        sv("finished"),
    finalized_at:  ts(now),
  }, ["transcript_id", "status", "finalized_at"]);
  console.log(`[seed-transcripts] Patched lecture: ${patched ? "OK" : "FAILED"}`);

  // Seed segments (realistic lecture content)
  const segments = [
    { start: 0,    end: 8,   text: "بسم الله الرحمن الرحيم، مرحباً بكم في محاضرة اليوم حول نظريات الاحتمالات المتقدمة." },
    { start: 8,    end: 18,  text: "سنبدأ بمراجعة سريعة لمفاهيم التوزيع الطبيعي التي درسناها في الأسبوع الماضي." },
    { start: 18,   end: 30,  text: "التوزيع الطبيعي يتميز بالتماثل حول الوسط الحسابي، وهو ما يُعرف أيضاً بالمنحنى الجرسي." },
    { start: 30,   end: 42,  text: "الآن سننتقل إلى مفهوم التوزيع ذو الحدين، أو Binomial Distribution. هل لديكم أسئلة حتى الآن؟" },
    { start: 42,   end: 55,  text: "التوزيع ذو الحدين يُستخدم عندما يكون لدينا تجارب مستقلة ونتائجها إما نجاح أو فشل." },
    { start: 55,   end: 70,  text: "المعادلة الأساسية هي: P(X=k) = C(n,k) × p^k × (1-p)^(n-k) حيث n هو عدد التجارب." },
    { start: 70,   end: 85,  text: "دعونا نحل مثالاً تطبيقياً: إذا رمينا عملة معدنية عشر مرات، ما احتمال الحصول على صورة خمس مرات بالضبط؟" },
    { start: 85,   end: 100, text: "الجواب: P(X=5) = C(10,5) × 0.5^5 × 0.5^5 = 252 × 0.03125 × 0.03125 ≈ 0.246. شكراً لاهتمامكم." },
  ];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segId = `seg_${String(i).padStart(3, "0")}`;
    await fsCreate(`transcripts/${transcriptId}/segments`, segId, {
      chunk_index: iv(i),
      start:       dv(seg.start),
      end:         dv(seg.end),
      text:        sv(seg.text),
      created_at:  ts(new Date(now.getTime() - (100 - seg.start) * 1000)),
    });
    console.log(`[seed-transcripts] Created segment ${i + 1}/${segments.length}`);
  }

  console.log(`\n[seed-transcripts] Done!`);
  console.log(`  Lecture:    ${lectureId}`);
  console.log(`  Transcript: ${transcriptId}`);
  console.log(`  Segments:   ${segments.length}`);
  console.log(`\nOpen the Transcripts page and click "View Transcript" to see it.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
