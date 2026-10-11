# Lockstep — Usable Security Prototype

Plain HTML, CSS and JavaScript. No build step, no framework, no dependencies.

```
lockstep-site/
├── index.html      Landing page: hero, protection map, mini guide, tradeoff simulator
├── setup.html      Redesigned setup flow (Submissions 2–3)
├── baseline.html   Plain "typical phone" flow for the comparison test
├── _headers        Netlify security headers (CSP, HSTS, etc.)
├── fonts/          Self-hosted DM Sans + Fraunces (no Google requests)
├── css/styles.css  All styles (Paper Signal palette)
├── js/icons.js     Inline SVG icons + small helpers (focus trap, escaping)
├── js/home.js      Landing page behaviour
├── js/setup.js     Setup flow: Intro → Screen lock → Biometrics → Encryption → Review → Settings
├── js/baseline.js  Baseline flow
├── js/security.js  zxcvbn strength, Pwned Passwords check, PIN blocklist, WebAuthn
├── js/study.js     Study mode: task metrics, SUS, comprehension, copyable results
├── js/tools.js     EN/FIL, larger text, read aloud
├── js/i18n.js      English + Filipino strings
├── js/vendor/zxcvbn.js
└── assets/logo.svg
```

## Run it

Double-click `index.html`, or serve the folder with any static server:

```
py -m http.server 8000
```

Deploy by uploading the folder to any static host (GitHub Pages, Netlify, Vercel, etc.).

## URL options

| URL | What it does |
|---|---|
| `setup.html?study=1` | Study mode for the redesign: records time per screen, skips, errors, "More details" opens, then shows SUS + comprehension questions and a copyable results row |
| `baseline.html?study=1` | Same, for the baseline flow |
| `?lang=fil` | Filipino |
| `?text=lg` | Larger text |

Real fingerprint/face (WebAuthn) and the breach check need HTTPS or localhost.

## Privacy boundary

All state is kept in memory for the current page only. Nothing is written to
localStorage, sessionStorage or cookies. The only network request is the
Pwned Passwords range lookup, which sends just the first 5 characters of the
password's SHA-1 hash (k-anonymity), never the password. PIN, pattern and
password entries are discarded as soon as they are checked. Study results never
leave the page unless the researcher copies them.
