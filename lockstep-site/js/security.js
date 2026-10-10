// Real security checks used by the setup flow. Everything runs in the browser.
//  - Password strength: zxcvbn (Dropbox, MIT), self-hosted in js/vendor.
//  - Breach check: Have I Been Pwned "Pwned Passwords" range API (free, no key) using
//    k-anonymity — only the first 5 hex characters of the SHA-1 hash are sent.
//  - PIN blocklist: repeats, sequences, years, dates, and keypad lines.
//  - Real biometrics: WebAuthn platform authenticator (user verification only).
(function () {
  /* ---------- Passwords ---------- */
  function passwordStrength(pw) {
    if (!pw) return { score: -1 };
    if (typeof window.zxcvbn === "function") {
      const r = window.zxcvbn(pw.slice(0, 64), ["lockstep", "password", "phone", "security"]);
      return {
        score: r.score, // 0..4
        crackTime: r.crack_times_display.offline_slow_hashing_1e4_per_second,
        warning: r.feedback.warning,
        suggestion: r.feedback.suggestions[0] || "",
      };
    }
    // Fallback if zxcvbn failed to load.
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((x) => x.test(pw)).length;
    const score = pw.length < 8 ? 0 : pw.length >= 14 && classes >= 3 ? 4 : pw.length >= 12 || classes >= 3 ? 3 : 2;
    return { score, crackTime: "", warning: "", suggestion: "" };
  }

  async function sha1Hex(text) {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  // Returns { count } (0 = not found) or { error: true } when the check can't run.
  async function breachCount(pw) {
    try {
      if (!window.crypto?.subtle) return { error: true };
      const hash = await sha1Hex(pw);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "Add-Padding": "true" },
        signal: controller.signal,
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      clearTimeout(timer);
      if (!res.ok) return { error: true };
      const body = await res.text();
      for (const line of body.split("\n")) {
        const [s, c] = line.trim().split(":");
        if (s === suffix) return { count: Number(c) || 0 };
      }
      return { count: 0 };
    } catch {
      return { error: true };
    }
  }

  /* ---------- PINs ---------- */
  const commonPins = new Set([
    "1234", "1111", "0000", "1212", "7777", "1004", "2000", "4444", "2222", "6969", "9999", "3333", "5555", "6666",
    "1122", "1313", "8888", "4321", "2001", "1010", "2580", "0852", "1470", "0741", "3690", "0963", "7410", "9630",
    "1357", "2468", "1590", "1478", "3214", "1236", "6789", "1230",
    "123456", "654321", "111111", "000000", "121212", "112233", "123123", "159753", "147258", "258369",
    "696969", "520520", "102030", "123321", "666666", "777777", "888888", "999999", "555555", "131313",
    "12345678", "87654321", "11111111", "00000000", "12341234", "147258369", "123456789",
  ]);

  function isWeakPin(pin) {
    if (commonPins.has(pin)) return true;
    if (/^(\d)\1+$/.test(pin)) return true; // all the same digit
    if (/^(\d\d)\1+$/.test(pin) || /^(\d\d\d)\1+$/.test(pin)) return true; // repeating blocks
    const asc = "0123456789012345678901234";
    const desc = "9876543210987654321098765";
    if (asc.includes(pin) || desc.includes(pin)) return true; // straight sequences
    if (pin.length === 4 && /^(19[4-9]\d|20[0-3]\d)$/.test(pin)) return true; // birth years
    if (pin.length === 4) {
      const a = Number(pin.slice(0, 2));
      const b = Number(pin.slice(2));
      if ((a >= 1 && a <= 12 && b >= 1 && b <= 31) || (b >= 1 && b <= 12 && a >= 1 && a <= 31)) return true; // MMDD / DDMM
    }
    return false;
  }

  /* ---------- WebAuthn (real platform biometrics) ---------- */
  async function platformAuthAvailable() {
    try {
      return !!(window.PublicKeyCredential && window.isSecureContext && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
    } catch {
      return false;
    }
  }

  // Asks the device's own fingerprint/face sensor to verify the user. Nothing is sent to a
  // server and the returned credential is discarded — we only use the "verified" outcome.
  async function verifyWithPlatform() {
    const random = (n) => crypto.getRandomValues(new Uint8Array(n));
    await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: "Lockstep demo" },
        user: { id: random(16), name: "lockstep-demo", displayName: "Lockstep demo" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        timeout: 60000,
        attestation: "none",
      },
    });
    return true;
  }

  /* ---------- Patterns ---------- */
  // Dots are numbered 0–8, left to right, top to bottom. These shapes (letters, squares,
  // straight runs) are among the most commonly chosen and guessed unlock patterns.
  const commonShapes = [
    "03678", "25876", "63012", "85210", // L, J, Γ shapes
    "0124678", "2104876", // Z and S
    "2103678", "0367852", // C and U
    "6304852", "6304258", "0364852", // N, M, W
    "01258763", "01246", "01258", // square, 7, 7-hook
    "012345678", "210345876", "036147258", // full snakes
    "0148", "2046", "01236", "21058", // short corner shapes
  ];

  function isCommonPattern(seq) {
    const p = seq.join("");
    const rev = [...seq].reverse().join("");
    return commonShapes.includes(p) || commonShapes.includes(rev);
  }

  const startsTopLeft = (seq) => seq[0] === 0;

  /* ---------- Lock verifier (like a phone's stored check value) ---------- */
  // The secret itself is never kept. We store a salted PBKDF2 hash in memory, which is
  // enough to check "is this the right PIN?" and is discarded when the page closes.
  async function deriveVerifier(secret, salt = crypto.getRandomValues(new Uint8Array(16))) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
    return { salt, hash: new Uint8Array(bits) };
  }

  async function checkVerifier(secret, verifier) {
    const { hash } = await deriveVerifier(secret, verifier.salt);
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ verifier.hash[i]; // constant-time compare
    return diff === 0;
  }

  const canVerify = () => !!window.crypto?.subtle;

  window.LockstepSecurity = { passwordStrength, breachCount, isWeakPin, isCommonPattern, startsTopLeft, deriveVerifier, checkVerifier, canVerify, platformAuthAvailable, verifyWithPlatform };
})();
