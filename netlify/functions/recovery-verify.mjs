// POST /api/recovery/verify  { email, code, token }  →  { ok: true } or { error }
import { json, sameOrigin, EMAIL_RE, hash, checkCode, allow, markUsed, isUsed } from "../lib/recovery.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!sameOrigin(req)) return json(403, { error: "forbidden" });
  if (!process.env.RECOVERY_SECRET) return json(503, { error: "not_configured" });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "wrong" }); }
  const email = String(body?.email || "").trim().toLowerCase();
  const code = String(body?.code || "").trim();
  const token = String(body?.token || "");
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code) || token.length > 1000) return json(400, { error: "wrong" });

  const result = checkCode(email, code, token);
  if (result.status === "invalid") return json(400, { error: "expired" });

  // Max 5 tries per code, and each code works once.
  if (!(await allow(`tries:${hash(result.nonce)}`, 5, 15 * 60_000))) return json(429, { error: "too_many" });
  if (await isUsed(result.nonce)) return json(400, { error: "expired" });
  if (result.status === "expired") return json(400, { error: "expired" });
  if (result.status !== "ok") return json(400, { error: "wrong" });

  await markUsed(result.nonce);
  return json(200, { ok: true });
};

export const config = { path: "/api/recovery/verify" };
