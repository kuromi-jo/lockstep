# Lockstep Threat Model

**Scope:** first-time phone security setup (screen lock, biometrics, encryption, review), as defined in Submission 3 *Scope and Limitations*.

## What we protect

| Asset | CIA goal | Where Lockstep helps |
|---|---|---|
| Messages, photos, accounts, e-wallets | Confidentiality | Screen lock, encryption, hidden lock-screen notifications |
| One-time codes (OTP) shown in notifications | Confidentiality | "Hide sensitive content" is the default |
| The owner's identity when unlocking | Integrity (authentication) | Strong lock rules, biometrics backed by the lock |
| The owner's own access to the phone | Availability | Confirmation entry, PIN backup for biometrics, review screen with "Fix now" |

## Who might attack, and what stops them

| Threat actor | Attack | Countermeasure in Lockstep | What's left over |
|---|---|---|---|
| **Finder or thief** (has the phone, doesn't know the lock) | Guesses common PINs and patterns | PIN blocklist (1234, 2580, years, dates), common-shape pattern block, 6-digit default, "Test your lock" shows lockout delays | A lucky guess in the first few tries |
| | Reads storage by connecting the phone to a computer | Encryption on by default; turning it off needs a checked acknowledgement | Encryption is only as strong as the lock code, which the review screen shows as half credit |
| | Reads OTPs and messages on the lock screen | Notifications default to "Hide sensitive content" | User chooses "Show all" |
| | Uses "Forgot your lock" to reset the lock with their own email | The recovery email is set by the owner during setup (while unlocked) and cannot be typed or changed on the recovery screen; the code goes only there. Codes are 6 digits, expire in 10 minutes, work once, allow 5 tries, and sends are rate-limited (5 per IP, 3 per email per hour) | The owner's email account is compromised, or no recovery email was set (then no email reset is possible) |
| | Uses the phone while it's still unlocked | Auto-lock defaults to 30 seconds | Phone taken within those 30 seconds |
| **Shoulder-surfer** (watches you unlock) | Watches the PIN or pattern being entered | Biometrics means typing the PIN less often; "Show pattern while unlocking" is off by default | Watching closely and repeatedly |
| **Online attacker** (reused or leaked passwords) | Tries passwords from breach lists | Pwned Passwords check blocks breached passwords; zxcvbn blocks guessable ones | A new, never-leaked weak password that zxcvbn rates as fair |
| **The user** (unintentional) | Skips steps without understanding, or forgets the lock | Informed-skip warnings, reminder banner, live meter, confirmation entry, plain-language explanations | User skips anyway (allowed, for user control) |
| **Someone using a shared test device** (study sessions) | Reads the previous participant's choices | Nothing is stored; the page clears itself after 3 minutes idle | Someone using the device within those 3 minutes |

## How the prototype itself is protected

| Risk | Control |
|---|---|
| Secret leakage | PIN, pattern and password are never stored. Only a salted PBKDF2 hash (100,000 iterations) is kept in memory for "Test your lock", and it is discarded on reload. |
| Breach-check privacy | k-anonymity: only the first 5 characters of the SHA-1 hash are sent, with padding and no referrer. |
| Script injection (XSS) | Strict Content-Security-Policy (no inline scripts or styles), all dynamic text escaped, no third-party scripts. |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| Downgrade / sniffing | HSTS, `X-Content-Type-Options: nosniff`, HTTPS only |
| Tracking | Self-hosted fonts, `Referrer-Policy: no-referrer`, no analytics, no cookies or local storage |
| Biometric data | WebAuthn returns only "verified" or "not verified". The fingerprint or face never leaves the device. |

## Out of scope

Malware, remote lock and wipe, account sign-in and multi-factor authentication, app permissions, the cryptographic strength of the operating system, and attacks on real hardware. The prototype simulates setup; it does not change real device settings.
