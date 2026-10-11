# Lockstep: Usable Security Prototype

Lockstep is a redesign of the first-time phone security setup (screen lock, biometrics, encryption, and a final review). It was built for **IT 021 – Usable Security** (Group #1, BSIT IT31S6, Technological Institute of the Philippines – Quezon City).

The prototype **simulates** setup in the browser. It does not change any real device setting, and it does not keep any PIN, pattern, password, or biometric data.

The front end is plain HTML, CSS and JavaScript with no build step and no framework. The optional email-recovery feature uses two small serverless functions (Netlify Functions).

## What's in the prototype

| Page | Purpose |
|---|---|
| `index.html` | Landing page: overview, protection map, mini guide, tradeoff simulator |
| `setup.html` | **Lockstep (redesign):** Intro → Screen lock → Biometrics → Encryption → Review → Settings |
| `baseline.html` | **Baseline:** a plain "typical phone" setup, used as the comparison for the usability test |

Main design features of the redesign: plain-language explanations, a live protection meter, informed-skip warnings, encryption on by default, a review screen with "Fix now", email-based lock recovery, English/Filipino support, larger text, and read-aloud.

## Project structure

```
lockstep/
├── lockstep-site/                Static site (published folder)
│   ├── index.html
│   ├── setup.html
│   ├── baseline.html
│   ├── _headers                  Security headers (CSP, HSTS, etc.)
│   ├── assets/logo.svg
│   ├── fonts/                    Self-hosted DM Sans and Fraunces
│   ├── css/                      styles.css, fonts.css
│   └── js/
│       ├── home.js               Landing page behaviour
│       ├── setup.js              Redesigned setup flow
│       ├── baseline.js           Baseline flow
│       ├── security.js           Strength check, breach check, PIN blocklist, WebAuthn
│       ├── study.js              Study mode (metrics, SUS, comprehension, results)
│       ├── tools.js              Language, larger text, read aloud, idle wipe
│       ├── i18n.js               English and Filipino strings
│       ├── icons.js              Inline SVG icons and helpers
│       └── vendor/zxcvbn.js      Password strength estimator
├── netlify/
│   ├── functions/
│   │   ├── recovery-send.mjs     Emails a 6-digit recovery code
│   │   └── recovery-verify.mjs   Verifies the code
│   └── lib/recovery.mjs          Shared code-signing and rate-limit helpers
├── netlify.toml                  Build and function configuration
├── package.json
├── THREAT_MODEL.md               Assets, threat actors, countermeasures, scope
└── Lockstep_Survey_FINAL.md      Questionnaire used for the comparison study
```

## Running it

**Front end only (no recovery email):** open `lockstep-site/index.html`, or serve the folder with any static server:

```
cd lockstep-site
py -m http.server 8000
```

Then visit `http://localhost:8000`. Real fingerprint/face verification (WebAuthn) and the breach check need HTTPS or `localhost`.

**With email recovery:** the recovery endpoints run as Netlify Functions, so use Netlify (deployed, or locally with the Netlify CLI):

```
npm install
netlify dev
```

Set these environment variables in Netlify (Site settings → Environment variables), or in a local `.env` file that is not committed:

| Variable | Description |
|---|---|
| `BREVO_API_KEY` | API key for the Brevo email service (keep secret) |
| `BREVO_SENDER_EMAIL` | A sender address verified in Brevo |
| `BREVO_SENDER_NAME` | Optional display name (default: "Lockstep demo") |
| `RECOVERY_SECRET` | Random string of 32+ characters used to sign codes |

If these are not set, the rest of the prototype works normally and only the email-recovery step is unavailable.

## URL options

| URL | What it does |
|---|---|
| `setup.html?study=1` | Study mode for the redesign: records time per screen, skips, errors and "More details" opens, then shows the SUS and comprehension questions and a copyable results row |
| `baseline.html?study=1` | The same study mode for the baseline flow |
| `?lang=fil` | Filipino interface |
| `?text=lg` | Larger text |

Preferences are kept in the URL, so nothing needs to be stored in the browser.

## Security and privacy

- **No stored secrets.** PIN, pattern and password entries are checked and discarded. Only a salted PBKDF2 hash (100,000 iterations) is held in memory for the "Test your lock" screen, and it is lost on reload.
- **No browser storage.** Nothing is written to localStorage, sessionStorage or cookies, and there are no analytics or third-party scripts.
- **Private breach check.** The Pwned Passwords lookup sends only the first 5 characters of the password's SHA-1 hash (k-anonymity), never the password.
- **Biometrics stay on the device.** WebAuthn only reports "verified" or "not verified".
- **Email recovery.** The code is generated on the server and signed, and it is not stored. Codes have 6 digits, expire after 10 minutes, work once, and allow 5 attempts. Sending is limited to 5 per IP and 3 per email address per hour. The recovery email is set during setup and cannot be changed on the recovery screen. The email address is used only to send the code and is not stored.
- **Shared test devices.** The page clears itself after 3 minutes without input (with a warning at 2 minutes 30 seconds). Study results leave the page only if the researcher copies them.
- **Hardening.** Strict Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, `nosniff`, and `Referrer-Policy: no-referrer` are set in `_headers`.

The only network requests are the Pwned Passwords range lookup and, if the user chooses email recovery, the two recovery endpoints. See `THREAT_MODEL.md` for the full analysis and what is out of scope.

## Deployment

Connect the repository to Netlify. `netlify.toml` publishes `lockstep-site/` and deploys the functions in `netlify/functions/`. Add the environment variables above, then check the headers with [securityheaders.com](https://securityheaders.com) after deploying. A static-only deployment (GitHub Pages, etc.) also works, without the email-recovery feature.

## Limitations

Lockstep is a class prototype. It simulates setup and does not modify real phone settings. It does not cover malware, remote lock and wipe, account sign-in or multi-factor authentication, app permissions, or attacks on real hardware.
