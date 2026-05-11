// Browser-side Brevo client.
//
// SECURITY NOTE: VITE_* vars are bundled into the JS that ships to the
// browser, so the API key is visible to anyone who opens devtools. For
// production move this back to the backend-brevo Express server.

const API_KEY = import.meta.env.VITE_BREVO_API_KEY || "";
const SENDER  = {
  email: import.meta.env.VITE_BREVO_SENDER_EMAIL || "seif.amr.ebeid@gmail.com",
  name:  import.meta.env.VITE_BREVO_SENDER_NAME  || "Classroom Emotion Detection",
};

export const brevoConfigured = () => !!API_KEY && !API_KEY.includes("PUT-YOUR-KEY");

export async function sendBrevoEmail({ recipients, subject, body }) {
  if (!brevoConfigured()) {
    return { ok: false, status: "stub", messageId: `stub-${Date.now()}`,
             error: "VITE_BREVO_API_KEY not set — no email actually sent" };
  }
  const cleaned = (recipients || []).filter(Boolean).map((e) => ({ email: e }));
  if (!cleaned.length) {
    return { ok: false, status: "failed", messageId: null, error: "no recipients" };
  }

  const payload = {
    sender: SENDER,
    to: cleaned,
    subject,
    htmlContent: `<p>${(body || "").replace(/\n/g, "<br>")}</p>`,
    textContent: body || "",
  };

  try {
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
      return { ok: false, status: "failed", messageId: null, error: `Brevo ${r.status}: ${text}` };
    }
    const json = text ? JSON.parse(text) : {};
    return {
      ok: true, status: "sent",
      messageId: json.messageId || json.messageIds?.[0] || null,
      error: null,
    };
  } catch (e) {
    return { ok: false, status: "failed", messageId: null, error: e.message };
  }
}
