// Shared helpers for email recovery (Netlify Functions).
// Stateless design: the 6-digit code is never stored or returned to the browser. The browser
// gets a signed token (HMAC over email + code + expiry + nonce); the server re-computes the
// HMAC to verify. Netlify Blobs (if available) adds rate limits and one-time use.
import crypto from "node:crypto";

export const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
const CODE_TTL_MS = 10 * 60 * 1000;

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Reject cross-site calls: only pages on this site may use the endpoints.
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

export const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 32);

function secret() {
  const s = process.env.RECOVERY_SECRET;
  if (!s || s.length < 32) throw new Error("RECOVERY_SECRET is missing or shorter than 32 characters");
  return s;
}

const mac = (data) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");
const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const decode = (str) => JSON.parse(Buffer.from(String(str), "base64url").toString("utf8"));

export function issueCode(email) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const exp = Date.now() + CODE_TTL_MS;
  const nonce = crypto.randomBytes(12).toString("base64url");
  const sig = mac(`${email}|${code}|${exp}|${nonce}`);
  return { code, token: encode({ exp, nonce, sig }) };
}

// Returns { status: "ok" | "invalid" | "expired" | "wrong", nonce }
export function checkCode(email, code, token) {
  let t;
  try { t = decode(token); } catch { return { status: "invalid" }; }
  if (!t || typeof t.exp !== "number" || typeof t.nonce !== "string" || typeof t.sig !== "string") return { status: "invalid" };
  if (Date.now() > t.exp) return { status: "expired", nonce: t.nonce };
  const expected = Buffer.from(mac(`${email}|${code}|${t.exp}|${t.nonce}`));
  const given = Buffer.from(t.sig);
  const ok = expected.length === given.length && crypto.timingSafeEqual(expected, given);
  return { status: ok ? "ok" : "wrong", nonce: t.nonce };
}

/* ---------- Rate limits and one-time use (Netlify Blobs) ---------- */
async function store() {
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore("lockstep-recovery");
  } catch {
    return null; // e.g. local testing without Netlify: limits are skipped
  }
}

// Counts an event under `key`; returns false once `max` is exceeded within `windowMs`.
export async function allow(key, max, windowMs) {
  const s = await store();
  if (!s) return true;
  try {
    const now = Date.now();
    const rec = (await s.get(key, { type: "json" })) || { n: 0, start: now };
    if (now - rec.start > windowMs) { rec.n = 0; rec.start = now; }
    rec.n += 1;
    await s.setJSON(key, rec);
    return rec.n <= max;
  } catch {
    return true;
  }
}

export async function markUsed(nonce) {
  const s = await store();
  if (s) try { await s.setJSON(`used:${hash(nonce)}`, { at: Date.now() }); } catch {}
}

export async function isUsed(nonce) {
  const s = await store();
  if (!s) return false;
  try { return !!(await s.get(`used:${hash(nonce)}`, { type: "json" })); } catch { return false; }
}
