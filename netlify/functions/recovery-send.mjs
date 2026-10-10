// POST /api/recovery/send  { email }  →  { token, expiresIn }
// Emails a 6-digit recovery code through Brevo. The API key stays on the server.
import { json, sameOrigin, EMAIL_RE, hash, issueCode, allow } from "../lib/recovery.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!sameOrigin(req)) return json(403, { error: "forbidden" });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_email" }); }
  const email = String(body?.email || "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return json(400, { error: "invalid_email" });

  const { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME = "Lockstep demo", RECOVERY_SECRET } = process.env;
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL || !RECOVERY_SECRET) return json(503, { error: "not_configured" });

  // Abuse limits: 5 sends per IP and 3 per email address, per hour.
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
  if (!(await allow(`ip:${hash(ip)}`, 5, 3600_000)) || !(await allow(`email:${hash(email)}`, 3, 3600_000))) {
    return json(429, { error: "rate_limited" });
  }

  const { code, token } = issueCode(email);
  const text = `Your Lockstep demo recovery code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email. Lockstep is a class prototype (IT 021 Usable Security); no account was created and your email is not stored.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#172722;max-width:480px">
    <p style="font-size:14px">Your Lockstep demo recovery code is:</p>
    <p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
    <p style="font-size:13px;color:#68736c">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    <p style="font-size:12px;color:#68736c">Lockstep is a class prototype (IT 021 Usable Security). No account was created and your email is not stored.</p>
  </div>`;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      // The code is deliberately NOT in the subject, so it doesn't show on a locked phone's notifications.
      body: JSON.stringify({
        sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
        to: [{ email }],
        subject: "Your Lockstep demo recovery code",
        textContent: text,
        htmlContent: html,
      }),
    });
    if (!res.ok) return json(502, { error: "send_failed" });
  } catch {
    return json(502, { error: "send_failed" });
  }

  return json(200, { token, expiresIn: 600 });
};

export const config = { path: "/api/recovery/send" };
