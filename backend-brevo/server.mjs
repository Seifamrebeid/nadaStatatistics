// Tiny Express server: doctor portal calls POST /api/send-notification.
// Server forwards to Brevo's transactional email API and writes the audit row
// to Firestore (collection: notifications).
//
// Run:
//   cd backend-brevo
//   cp .env.example .env  # then fill in BREVO_API_KEY + verified sender
//   npm install
//   npm start              # -> http://localhost:8001

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const PORT       = parseInt(process.env.PORT || "8001", 10);
const PROJECT    = process.env.FIREBASE_PROJECT_ID || "fridgechef-jt50c";
const FS_HOST    = process.env.FIRESTORE_EMULATOR_HOST || "localhost:8080";
const FS_BASE    = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const FS_HEAD    = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const API_KEY    = process.env.BREVO_API_KEY || "";
const SENDER     = {
  email: process.env.BREVO_SENDER_EMAIL || "noreply@example.local",
  name:  process.env.BREVO_SENDER_NAME  || "Classroom Emotion Detection",
};
const MODE       = (process.env.SEND_MODE || (API_KEY ? "live" : "stub")).toLowerCase();
const ALLOWED    = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                // curl / Postman / server-to-server
    if (!ALLOWED.length || ALLOWED.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
}));

// ── Firestore encoders (just enough to write the audit row) ────────────
const encode = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return { timestampValue: v };
    return { stringValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = encode(val);
    return { mapValue: { fields } };
  }
  throw new Error(`unsupported value: ${v}`);
};
const fields = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = encode(v);
  return out;
};
async function writeNotification(row) {
  const r = await fetch(`${FS_BASE}/notifications`, {
    method: "POST",
    headers: FS_HEAD,
    body: JSON.stringify({ fields: fields(row) }),
  });
  if (!r.ok) throw new Error(`Firestore write failed: HTTP ${r.status}: ${await r.text()}`);
  const doc = await r.json();
  return doc.name.split("/").pop();
}

// ── Brevo API call ─────────────────────────────────────────────────────
async function sendViaBrevo({ recipients, subject, htmlBody, textBody }) {
  // recipients: [{ email, name }]
  // Brevo: https://developers.brevo.com/reference/sendtransacemail
  const payload = {
    sender: SENDER,
    to: recipients,
    subject,
    htmlContent: htmlBody || `<p>${(textBody || "").replace(/\n/g, "<br>")}</p>`,
    textContent: textBody || htmlBody?.replace(/<[^>]+>/g, ""),
  };
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": API_KEY,
      "content-type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Brevo ${r.status}: ${text}`);
  }
  const json = text ? JSON.parse(text) : {};
  return json.messageId || json.messageIds?.[0] || null;
}

// ── Routes ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mode: MODE,
    hasApiKey: !!API_KEY,
    sender: SENDER,
    project: PROJECT,
    firestore: FS_HOST,
  });
});

app.post("/api/send-notification", async (req, res) => {
  try {
    const {
      sender_doctor_id,
      lecture_id,
      recipient_student_ids,
      recipient_emails,
      subject,
      body,
    } = req.body || {};

    if (!Array.isArray(recipient_emails) || recipient_emails.length === 0) {
      return res.status(400).json({ error: "recipient_emails is required (non-empty array)" });
    }
    if (!subject || !body) {
      return res.status(400).json({ error: "subject and body are required" });
    }

    const recipients = recipient_emails
      .filter(Boolean)
      .map((e) => ({ email: e }));

    let status = "sent";
    let brevoMessageId = null;
    let errorText = null;

    if (MODE === "stub" || !API_KEY) {
      console.log(`[brevo] STUB mode — would have emailed ${recipients.length} recipient(s)`);
      brevoMessageId = `stub-${Date.now()}`;
    } else {
      try {
        brevoMessageId = await sendViaBrevo({
          recipients, subject, textBody: body,
        });
        console.log(`[brevo] sent ok, messageId=${brevoMessageId}`);
      } catch (e) {
        status = "failed";
        errorText = e.message;
        console.error(`[brevo] send failed: ${e.message}`);
      }
    }

    // Audit row — always written, even on failure.
    const auditId = await writeNotification({
      sender_doctor_id:      sender_doctor_id || null,
      lecture_id:            lecture_id || null,
      recipient_student_ids: recipient_student_ids || [],
      recipient_emails,
      subject,
      body,
      sent_at:               new Date(),
      status,
      brevo_message_id:      brevoMessageId,
      error:                 errorText,
    });

    res.json({ ok: status === "sent", status, audit_id: auditId, brevo_message_id: brevoMessageId, error: errorText });
  } catch (e) {
    console.error(`[brevo] /api/send-notification crashed: ${e.stack || e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[brevo] listening on http://localhost:${PORT}  mode=${MODE}  hasKey=${!!API_KEY}`);
  if (!API_KEY && MODE !== "stub") {
    console.warn(`[brevo] WARNING: BREVO_API_KEY is not set. Falling back to stub mode.`);
  }
});
