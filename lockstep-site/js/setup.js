// Lockstep mobile security setup flow (Submissions 2–3):
// Intro → Screen lock (PIN / Pattern / Password) → Biometrics → Encryption → Review → Settings.
// State lives in memory only. Secrets are discarded as soon as they are checked; the only
// network call is the k-anonymous Pwned Passwords range lookup (first 5 hash characters).
(function () {
  const $ = (id) => document.getElementById(id);
  const icon = window.icon;
  const esc = window.escapeHtml;
  const T = window.T;
  const Sec = window.LockstepSecurity;
  const Study = window.Study;
  const content = $("flow-content");

  const lockLabel = (type) => ({ pin: T.pin, pattern: T.pattern, password: T.password })[type];
  const progressIndex = { welcome: 0, lock: 1, pin: 1, pattern: 1, password: 1, lockopts: 1, locktest: 1, biometric: 2, encryption: 3, review: 4, settings: 4 };

  const freshEntry = () => ({ first: "", confirm: "", confirming: false, error: "", notice: "", reveal: false, pattern: [], patternFirst: null, checking: false });

  const state = {
    screen: "welcome",
    history: [],
    returnToReview: false,
    saved: false,
    details: false,
    pinMore: false,
    security: {
      lock: { type: null, status: "unset", strong: false }, // status: unset | set | later
      biometric: { status: "unset", method: "" }, // unset | set | later; method: real | simulated
      encryption: { status: "enabled" }, // enabled | declined — on by default (R4)
    },
    pinLength: 6, // recommended default (R2, DF-03)
    customLength: "",
    entry: freshEntry(),
    bio: "unset", // unset | scanning | set
    bioProgress: 0,
    bioNote: "",
    platformAuth: false,
    // Lock options chosen after saving a lock — secure defaults preselected.
    lockOptions: { notif: "hide", autoLock: 30, showPattern: false },
    verifier: null, // salted PBKDF2 hash of the lock (never the lock itself)
    test: { attempts: 0, lockedUntil: 0, status: "", pattern: [] },
    recoveryEmail: "", // set by the owner during setup; recovery can only send here
    recovery: null, // { stage: "email" | "code" | "done", email, token, error, busy }
  };

  let testTimer = null;

  let scanTimer = null;
  let releaseTrap = null;
  let lastFocus = null;

  /* ---------- Navigation ---------- */
  function go(screen, { push = true } = {}) {
    if (push && state.screen !== screen) state.history.push(state.screen);
    state.screen = screen;
    state.details = false;
    state.entry.error = "";
    state.entry.notice = "";
    stopScan();
    clearInterval(testTimer);
    if (screen !== "locktest") state.recovery = null;
    window.stopReading?.();
    Study.screen(screen);
    render(true);
  }

  function back() {
    const previous = state.history.pop();
    if (!previous) return;
    Study.event("back", state.screen);
    go(previous, { push: false });
  }

  function advance(defaultNext) {
    if (state.returnToReview) {
      state.returnToReview = false;
      go("review");
    } else go(defaultNext);
  }

  function editLayer(layer) {
    Study.event("fix", layer);
    state.returnToReview = true;
    if (layer === "biometric" && state.security.biometric.status !== "set") state.bio = "unset";
    go(layer);
  }

  /* ---------- Scoring: two checks per layer (on + backed by a strong lock) ---------- */
  function checks(lock = state.security.lock) {
    const s = state.security;
    const lockSet = lock.status === "set";
    return {
      lock: [lockSet, lockSet && lock.strong],
      biometric: [s.biometric.status === "set", s.biometric.status === "set" && lockSet],
      encryption: [s.encryption.status === "enabled", s.encryption.status === "enabled" && lockSet],
    };
  }

  function risk(lock) {
    const c = checks(lock);
    const total = [...c.lock, ...c.biometric, ...c.encryption].filter(Boolean).length;
    const label = total >= 5 ? T.levelStrong : total >= 3 ? T.levelModerate : T.levelWeak;
    const level = total >= 5 ? "strong" : total >= 3 ? "moderate" : "weak";
    const parts = [];
    if (c.lock[0]) parts.push(lockLabel((lock || state.security.lock).type));
    if (c.biometric[0]) parts.push(T.biometrics);
    if (c.encryption[0]) parts.push(T.encryption);
    const summary = !c.lock[0] ? `${T.noLockSet}${parts.length ? ` · ${parts.join(" + ")}` : ""}` : parts.join(" + ");
    return { total, percent: Math.round((total / 6) * 100), label, level, summary };
  }

  // Live preview of what the meter would show if the lock being entered were saved (DF-02).
  function previewLock() {
    const mode = state.screen;
    const e = state.entry;
    if (mode === "pin" && e.first.length === state.pinLength && !Sec.isWeakPin(e.first)) return { type: "pin", status: "set", strong: state.pinLength >= 6 };
    if (mode === "password" && e.first.length >= 8) return { type: "password", status: "set", strong: Sec.passwordStrength(e.first).score >= 3 };
    if (mode === "pattern") {
      const dots = e.patternFirst !== null ? e.patternFirst.length : e.pattern.length;
      if (dots >= 4) return { type: "pattern", status: "set", strong: dots >= 6 };
    }
    return null;
  }

  function renderMeter() {
    const meter = $("flow-meter");
    if (state.screen === "welcome") { meter.hidden = true; return; }
    meter.hidden = false;
    const preview = previewLock();
    const r = risk(preview || undefined);
    meter.className = `flow-meter ${r.level}`;
    meter.innerHTML = `
      <div class="flow-meter-head"><span>${preview ? T.meterPreview : T.meterLabel}</span><strong>${r.label}</strong></div>
      <div class="flow-meter-track" role="progressbar" aria-label="${T.meterLabel}" aria-valuenow="${r.percent}" aria-valuemin="0" aria-valuemax="100" aria-valuetext="${r.label}: ${esc(r.summary)}"><span data-w="${Math.max(r.percent, 4)}"></span></div>
      <p>${r.label} – ${esc(r.summary || T.nothingOn)}</p>`;
    window.applyWidths(meter);
  }

  const statusText = {
    lock: () => (state.security.lock.status === "set" ? lockLabel(state.security.lock.type) : state.security.lock.status === "later" ? T.stLater : T.stNotSet),
    biometric: () => ({ set: T.stOn, later: T.stLater, unset: T.stNotSet })[state.security.biometric.status],
    encryption: () => (state.security.encryption.status === "enabled" ? T.stOn : T.stOffLost),
  };
  const optsSummary = () => T.optsSummary(T.notifShort[state.lockOptions.notif], state.lockOptions.autoLock);

  const layerHint = (id) => {
    const [on, backed] = checks()[id];
    if (!on || backed) return "";
    return id === "lock" ? T.hintStrongLock : T.hintNeedsLock;
  };

  /* ---------- Render ---------- */
  function render(focusHeading) {
    const { screen } = state;
    $("flow-step").textContent = screen === "welcome" ? T.stepIntro : screen === "review" ? T.stepReview : screen === "settings" ? T.stepSettings : T.stepSetup;
    $("flow-back").disabled = state.history.length === 0;
    const filled = progressIndex[screen];
    const progress = $("flow-progress");
    progress.setAttribute("aria-valuenow", filled);
    progress.innerHTML = [0, 1, 2, 3].map((i) => `<span class="${i < filled ? "active" : ""}"></span>`).join("");
    renderMeter();

    const views = { welcome, lock, pin: credential, pattern: credential, password: credential, lockopts, locktest, biometric, encryption, review, settings };
    window.idlePaused = !!state.recovery && state.recovery.stage === "code";
    content.innerHTML = views[screen]();
    window.applyWidths(content);
    if (screen === "pattern") drawPattern();
    if (screen === "locktest") drawTestPattern();
    if (focusHeading) {
      content.scrollTop = 0;
      content.querySelector("h2")?.focus({ preventScroll: true });
    }
  }

  const detailsToggle = (text) => `
    <button type="button" class="flow-details" data-action="details" aria-expanded="${state.details}" aria-controls="flow-detail">${T.moreDetails} ${icon("chevronDown", 15)}</button>
    ${state.details ? `<p class="flow-detail" id="flow-detail">${text}</p>` : ""}`;

  const errorLine = () =>
    (state.entry.error ? `<p class="flow-error" role="alert" id="entry-error">${esc(state.entry.error)}</p>` : "") +
    (state.entry.notice ? `<p class="flow-notice" role="status">${esc(state.entry.notice)}</p>` : "");

  // Fig. 1 — Intro, with everyday wording first and C/I/A as small tags (DF-03)
  function welcome() {
    const goal = (title, sub, tag, letter) => `<div><b>${letter}</b><strong>${title}</strong><small>${sub}</small><em>${tag}</em></div>`;
    return `<div class="flow-card centered">
      <div class="flow-icon brand">${icon("shieldCheck", 28)}</div>
      <p class="flow-eyebrow">${T.welcomeEyebrow}</p>
      <h2 tabindex="-1">${T.welcomeTitle}</h2>
      <p class="flow-text">${T.welcomeText}</p>
      <p class="flow-mini-label">${T.threeGoals}</p>
      <div class="cia-grid">
        ${goal(T.goalPrivate, T.goalPrivateSub, T.goalPrivateTag, "C")}
        ${goal(T.goalTrust, T.goalTrustSub, T.goalTrustTag, "I")}
        ${goal(T.goalRecover, T.goalRecoverSub, T.goalRecoverTag, "A")}
      </div>
      <p class="flow-note recommend">${icon("shieldCheck", 14)} ${T.recommended}</p>
      <button type="button" class="flow-primary" data-action="start">${T.getStarted} ${icon("arrowRight", 17)}</button>
      <p class="flow-note boundary">${icon("info", 14)} ${T.demoOnly}</p>
    </div>`;
  }

  // Fig. 2 — Screen lock choice
  function lock() {
    const current = state.security.lock;
    const option = (type, note) => {
      const selected = current.status === "set" && current.type === type;
      return `<button type="button" data-lock="${type}" class="${selected ? "selected" : ""}" ${selected ? 'aria-current="true"' : ""}>
        <span>${lockLabel(type)}<small>${note}</small>${selected ? `<small>${T.currentLock}</small>` : ""}</span>
        ${selected ? icon("check", 17).replace('class="ic"', 'class="ic check"') : icon("arrowRight", 17)}
      </button>`;
    };
    return `<div class="flow-card">
      <div class="flow-icon">${icon("lock", 25)}</div>
      <p class="flow-eyebrow">${T.lockEyebrow}</p>
      <h2 tabindex="-1">${T.lockTitle}</h2>
      <p class="flow-text">${T.lockText}</p>
      ${state.recovered && current.status !== "set" ? `<p class="flow-notice" role="status">${T.recAfterNote}</p>` : ""}
      ${detailsToggle(T.lockDetail)}
      <div class="flow-options">
        ${option("pin", T.pinNote)}
        ${option("pattern", T.patternNote)}
        ${option("password", T.passwordNote)}
      </div>
      <button type="button" class="flow-link" data-action="skip-lock">${T.noScreenLock}</button>
    </div>`;
  }

  // Figs. 3–5 — PIN (6 digits preselected), pattern, password
  function credential() {
    const mode = state.screen;
    const e = state.entry;
    const confirming = mode === "pattern" ? e.patternFirst !== null : e.confirming;
    const len = state.pinLength;

    const heading = {
      pin: confirming ? T.pinConfirmTitle : T.pinTitle(len),
      pattern: confirming ? T.patternConfirmTitle : T.patternTitle,
      password: confirming ? T.passwordConfirmTitle : T.passwordTitle,
    }[mode];
    const intro = {
      pin: confirming ? T.pinConfirmText : T.pinText(len),
      pattern: confirming ? T.patternConfirmText : T.patternText,
      password: confirming ? T.passwordConfirmText : T.passwordText,
    }[mode];

    let body = "";
    if (mode === "pin" && !confirming) {
      const preset = [4, 6, 8].includes(len) && !state.customLength;
      body += `<button type="button" class="flow-details" data-action="pin-more" aria-expanded="${state.pinMore}" aria-controls="pin-lengths">${T.otherLengths} ${icon("chevronDown", 15)}</button>`;
      if (state.pinMore) {
        body += `<div class="pin-length-picker" id="pin-lengths">
          <span id="len-label">${T.pinLengthLabel}</span>
          <div role="radiogroup" aria-labelledby="len-label">${[4, 6, 8].map((n) => `<button type="button" role="radio" aria-checked="${preset && len === n}" data-len="${n}">${T.digits(n)}${n === 6 ? `<small>${T.recommendedTag}</small>` : ""}</button>`).join("")}</div>
          <label>${T.customLength}
            <input id="custom-len" type="text" inputmode="numeric" maxlength="2" placeholder="${T.enterLength}" value="${esc(state.customLength)}" autocomplete="off" />
          </label>
          <small>${T.lengthHint}</small>
        </div>`;
      }
    }

    if (mode === "pattern") {
      body += `<div class="flow-pattern" id="pattern-pad" role="group" aria-label="${T.patternGrid}">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline id="pattern-line" points=""/></svg>
        ${Array.from({ length: 9 }, (_, i) => `<button type="button" class="pattern-dot" data-dot="${i}" aria-label="${T.dot(i + 1)}"><span></span></button>`).join("")}
      </div>
      <p class="flow-hint" id="pattern-hint" aria-live="polite">${patternHint()}</p>
      <button type="button" class="flow-link" data-action="clear-pattern">${T.clearPattern}</button>`;
    } else {
      const value = confirming ? e.confirm : e.first;
      const label = confirming ? T.confirm : mode === "pin" ? T.newPin : T.newPassword;
      const isPin = mode === "pin";
      body += `<label class="flow-field" for="secret">${label}
        <span class="input-wrap">
          <input id="secret" type="${e.reveal && !isPin ? "text" : "password"}" ${isPin ? `inputmode="numeric" maxlength="${len}"` : 'maxlength="64"'} autocomplete="${isPin ? "off" : "new-password"}" value="${esc(value)}" ${e.error ? 'aria-invalid="true" aria-describedby="entry-error"' : ""} ${e.checking ? "disabled" : ""} />
          ${isPin ? "" : `<button type="button" class="reveal" data-action="reveal" aria-pressed="${e.reveal}">${e.reveal ? T.hide : T.show}</button>`}
        </span>
      </label>`;
      if (mode === "password" && !confirming) {
        body += `<div class="strength" id="strength" data-level="${strengthLevel(e.first)}" aria-live="polite">${strengthMarkup(e.first)}</div>
          <p class="flow-hint left">${icon("shieldCheck", 12)} ${T.breachNote}</p>`;
      }
    }

    return `<div class="flow-card">
      <div class="flow-icon">${icon("key", 25)}</div>
      <p class="flow-eyebrow">${T.lockEyebrowType(lockLabel(mode))}</p>
      <h2 tabindex="-1">${heading}</h2>
      <p class="flow-text">${intro}</p>
      ${body}
      ${errorLine()}
      <button type="button" class="flow-primary" data-action="lock-continue" ${e.checking ? "disabled" : ""}>${e.checking ? T.checkingBreaches : confirming ? `${T.saveLock} ${icon("arrowRight", 17)}` : `${T.continue} ${icon("arrowRight", 17)}`}</button>
      <button type="button" class="flow-link" data-action="lock-back">${confirming ? T.startOver : T.back}</button>
    </div>`;
  }

  function patternHint() {
    const e = state.entry;
    const confirming = e.patternFirst !== null;
    const n = e.pattern.length;
    if (!n) return confirming ? T.patternRepeat : T.patternEmpty;
    return T.patternCount(n, !confirming && n < 4 ? 4 - n : 0);
  }

  // zxcvbn score 0..4 → meter level 1..4 (0 = nothing typed)
  const strengthLevel = (pw) => (pw ? Math.max(1, Sec.passwordStrength(pw).score) : 0);

  function strengthMarkup(pw) {
    if (!pw) return `<div class="strength-track" aria-hidden="true"><span></span><span></span><span></span><span></span></div><p>${T.strengthPrompt}</p>`;
    const s = Sec.passwordStrength(pw);
    const label = pw.length < 8 ? T.strengthLabels[0] : T.strengthLabels[s.score];
    const tip = pw.length < 8 ? T.errPasswordShort : [s.warning, s.suggestion].filter(Boolean)[0] || "";
    return `<div class="strength-track" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <p>${T.strength}: <strong>${label}</strong>${s.crackTime ? ` · ${T.crackTime(esc(s.crackTime))}` : ""}${tip && T.lang === "en" ? ` ${esc(tip)}` : ""}</p>`;
  }

  // Lock options: notification privacy, auto-lock, pattern visibility (secure defaults preselected)
  function lockopts() {
    const o = state.lockOptions;
    const radio = (name, value, label, note, checked, rec) => `<label class="opt ${checked ? "on" : ""}">
        <input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""} />
        <span><strong>${label}${rec ? ` <em>${T.recommendedTag}</em>` : ""}</strong>${checked ? `<small>${note}</small>` : ""}</span>
      </label>`;
    const notif = [["all", T.notifAll, T.notifAllNote], ["hide", T.notifHide, T.notifHideNote, true], ["none", T.notifNone, T.notifNoneNote]]
      .map(([v, l, n, rec]) => radio("notif", v, l, n, o.notif === v, rec)).join("");
    const auto = [30, 60, 300, 1800].map((v) => radio("autolock", v, T.autoLockOpt(v), T.autoLockNote(v), o.autoLock === v, v === 30)).join("");
    const isPattern = state.security.lock.type === "pattern";
    return `<div class="flow-card">
      <div class="flow-icon brand">${icon("check", 25)}</div>
      <p class="flow-eyebrow">${T.optsEyebrow}</p>
      <h2 tabindex="-1">${T.optsTitle}</h2>
      <p class="flow-text">${T.optsText}</p>
      ${errorLine()}
      <fieldset class="opt-group"><legend>${T.notifLabel}</legend>${notif}</fieldset>
      <fieldset class="opt-group"><legend>${T.autoLockLabel}</legend>${auto}</fieldset>
      ${isPattern ? `<label class="opt switch-opt"><input type="checkbox" id="show-pattern" role="switch" ${o.showPattern ? "checked" : ""} /><span><strong>${T.showPatternLabel}</strong><small>${T.showPatternNote}</small></span></label>` : ""}
      <label class="flow-field" for="rec-setup">${T.recSetupLabel}
        <input id="rec-setup" type="email" autocomplete="email" maxlength="254" placeholder="${T.recSetupPlaceholder}" value="${esc(state.recoveryEmail)}" />
      </label>
      <p class="flow-hint left">${icon("shieldCheck", 12)} ${T.recSetupNote}</p>
      <button type="button" class="flow-primary" data-action="opts-continue">${T.continue} ${icon("arrowRight", 17)}</button>
      ${state.verifier ? `<button type="button" class="flow-secondary" data-action="to-test">${icon("lock", 16)} ${T.testLock}</button>` : ""}
    </div>`;
  }

  // Test your lock: wrong guesses trigger a lockout, like a real phone.
  function guessSpace() {
    const l = state.security.lock;
    if (l.type === "pin") return { what: T.whatPin(l.length), n: 10 ** l.length };
    if (l.type === "pattern") return { what: T.whatPattern, n: 389112 };
    return { what: T.whatPassword, n: 95 ** 8 };
  }

  function locktest() {
    if (state.recovery) return recoveryView();
    const t = state.test;
    const type = state.security.lock.type;
    const locked = t.lockedUntil > Date.now();
    const secs = Math.ceil((t.lockedUntil - Date.now()) / 1000);
    const g = guessSpace();
    const time = T.duration((g.n / 5) * 30);
    let input;
    if (type === "pattern") {
      input = `<div class="flow-pattern ${state.lockOptions.showPattern ? "" : "hidden-trail"}" id="test-pad" role="group" aria-label="${T.patternGrid}">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline id="test-line" points=""/></svg>
        ${Array.from({ length: 9 }, (_, i) => `<button type="button" class="pattern-dot" data-tdot="${i}" aria-label="${T.dot(i + 1)}" ${locked ? "disabled" : ""}><span></span></button>`).join("")}
      </div>
      <p class="flow-hint" id="test-hint" aria-live="polite">${T.testDrawn(t.pattern.length)}</p>`;
    } else {
      input = `<label class="flow-field" for="test-secret">${lockLabel(type)}
        <input id="test-secret" type="password" ${type === "pin" ? 'inputmode="numeric"' : ""} autocomplete="off" ${locked ? "disabled" : ""} />
      </label>`;
    }
    const status = locked
      ? `<p class="flow-error" role="alert"><span id="lock-count">${T.testLocked(secs)}</span></p><button type="button" class="flow-link" data-action="skip-wait">${T.skipWait}</button>`
      : t.status === "ok" ? `<div class="flow-state" role="status">${icon("check", 16)} ${T.testOk}</div>`
      : t.status === "wrong" ? `<p class="flow-error" role="alert">${T.testWrong(5 - (t.attempts % 5))}</p>` : "";
    return `<div class="flow-card">
      <div class="flow-icon">${icon("lock", 25)}</div>
      <p class="flow-eyebrow">${T.testEyebrow}</p>
      <h2 tabindex="-1">${T.testTitle}</h2>
      <p class="flow-text">${T.testText(lockLabel(type))}</p>
      ${input}
      ${status}
      <button type="button" class="flow-primary" data-action="test-unlock" ${locked ? "disabled" : ""}>${T.unlock} ${icon("lock", 16)}</button>
      ${t.attempts >= 5 && t.status !== "ok" ? `<button type="button" class="flow-secondary" data-action="rec-start">${icon("mail", 16)} ${T.recLink}</button>` : ""}
      <div class="lesson"><strong>${T.testWhy}</strong><p>${T.testMath(g.what, time)}</p></div>
      <button type="button" class="flow-link" data-action="test-back">${state.history[state.history.length - 1] === "lockopts" ? T.backToOptions : T.back}</button>
    </div>`;
  }

  function drawTestPattern() {
    const pad = $("test-pad");
    if (!pad) return;
    const seq = state.test.pattern;
    pad.querySelectorAll(".pattern-dot").forEach((d) => d.classList.toggle("visited", seq.includes(Number(d.dataset.tdot))));
    $("test-line").setAttribute("points", seq.map((i) => `${20 + (i % 3) * 30},${20 + Math.floor(i / 3) * 30}`).join(" "));
    $("test-hint").textContent = T.testDrawn(seq.length);
  }

  async function testUnlock() {
    const t = state.test;
    if (t.lockedUntil > Date.now() || !state.verifier) return;
    const guess = state.security.lock.type === "pattern" ? t.pattern.join("") : $("test-secret")?.value || "";
    if (!guess) return;
    t.pattern = [];
    const ok = await Sec.checkVerifier(guess, state.verifier);
    if (ok) {
      t.status = "ok";
      t.attempts = 0;
      Study.event("locktest", "ok");
    } else {
      t.attempts++;
      t.status = "wrong";
      Study.event("locktest", "wrong");
      if (t.attempts % 5 === 0) {
        t.lockedUntil = Date.now() + 30000;
        Study.event("lockout");
        startLockoutTimer();
      }
    }
    render();
    (content.querySelector("#test-secret:not([disabled])") || content.querySelector("[role=alert], [role=status]"))?.focus?.();
  }

  function startLockoutTimer() {
    clearInterval(testTimer);
    testTimer = setInterval(() => {
      const left = Math.ceil((state.test.lockedUntil - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(testTimer);
        state.test.status = "";
        if (!state.recovery) render(); // never redraw over the recovery screens
        return;
      }
      const el = $("lock-count");
      if (el) el.textContent = T.testLocked(left);
    }, 1000);
  }

  /* ---------- Email recovery (after repeated failed unlocks) ---------- */
  const maskEmail = (e) => e.replace(/^(.{1,2})[^@]*(@.*)$/, "$1•••$2");

  function recoveryView() {
    const r = state.recovery;
    const err = r.error ? `<p class="flow-error" role="alert">${esc(T.recErr[r.error] || T.recErr.network)}</p>` : "";
    if (r.stage === "done") {
      return `<div class="flow-card">
        <div class="flow-icon brand">${icon("check", 25)}</div>
        <p class="flow-eyebrow">${T.recEyebrow}</p>
        <h2 tabindex="-1">${T.recDoneTitle}</h2>
        <p class="flow-text">${T.recDoneText}</p>
        <button type="button" class="flow-primary" data-action="rec-newlock">${T.recNewLock} ${icon("arrowRight", 17)}</button>
      </div>`;
    }
    if (r.stage === "code") {
      return `<div class="flow-card">
        <div class="flow-icon">${icon("mail", 25)}</div>
        <p class="flow-eyebrow">${T.recEyebrow}</p>
        <h2 tabindex="-1">${T.recCodeTitle}</h2>
        <p class="flow-text">${T.recCodeText(esc(maskEmail(r.email)))}</p>
        <label class="flow-field" for="rec-code">${T.recCode}
          <input id="rec-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${esc(r.code || "")}" ${r.busy ? "disabled" : ""} />
        </label>
        ${err}
        <button type="button" class="flow-primary" data-action="rec-verify" ${r.busy ? "disabled" : ""}>${r.busy ? T.recVerifying : `${T.recVerify} ${icon("check", 17)}`}</button>
        <button type="button" class="flow-link" data-action="rec-other">${T.recResend}</button>
      </div>`;
    }
    if (!state.recoveryEmail) {
      return `<div class="flow-card">
        <div class="flow-icon">${icon("mail", 25)}</div>
        <p class="flow-eyebrow">${T.recEyebrow}</p>
        <h2 tabindex="-1">${T.recNoneTitle}</h2>
        <p class="flow-text">${T.recNoneText}</p>
        <button type="button" class="flow-primary" data-action="rec-cancel">${T.recCancel}</button>
      </div>`;
    }
    return `<div class="flow-card">
      <div class="flow-icon">${icon("mail", 25)}</div>
      <p class="flow-eyebrow">${T.recEyebrow}</p>
      <h2 tabindex="-1">${T.recTitle}</h2>
      <p class="flow-text">${T.recText(esc(maskEmail(state.recoveryEmail)))}</p>
      <p class="flow-hint left">${icon("shieldCheck", 12)} ${T.recConsent}</p>
      ${err}
      <button type="button" class="flow-primary" data-action="rec-send" ${r.busy ? "disabled" : ""}>${r.busy ? T.recSending : `${T.recSend} ${icon("arrowRight", 17)}`}</button>
      <button type="button" class="flow-link" data-action="rec-cancel">${T.recCancel}</button>
    </div>`;
  }

  async function recoveryApi(path, body) {
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      if (!(res.headers.get("content-type") || "").includes("json")) return { error: "network" };
      const data = await res.json();
      return res.ok ? data : { error: data.error || "network" };
    } catch {
      return { error: "network" };
    }
  }

  async function recoverySend() {
    const r = state.recovery;
    r.email = state.recoveryEmail; // never an address typed at recovery time
    if (!r.email) return;
    r.busy = true; r.error = ""; render();
    const res = await recoveryApi("/api/recovery/send", { email: r.email });
    r.busy = false;
    if (res.error) { r.error = res.error; Study.event("recovery", `send-${res.error}`); render(); return content.querySelector("[role=alert]")?.focus?.(); }
    r.token = res.token;
    r.code = "";
    r.stage = "code";
    Study.event("recovery", "sent");
    render();
    content.scrollTop = 0;
    $("rec-code")?.focus({ preventScroll: true });
  }

  async function recoveryVerify() {
    const r = state.recovery;
    const code = (r.code || "").replace(/\D/g, "");
    if (code.length !== 6) { r.error = "wrong"; render(); return $("rec-code")?.focus(); }
    r.busy = true; r.error = ""; render();
    const res = await recoveryApi("/api/recovery/verify", { email: r.email, code, token: r.token });
    r.busy = false;
    if (res.error) { r.error = res.error; Study.event("recovery", `verify-${res.error}`); render(); return $("rec-code")?.focus(); }
    r.stage = "done";
    r.email = ""; r.token = ""; // forget the email as soon as it's no longer needed
    Study.event("recovery", "verified");
    render(true);
  }

  // Fig. 6 — Biometric enrollment (requires a lock as backup)
  function biometric() {
    const st = state.bio;
    const noLock = state.security.lock.status !== "set";
    const caption = st === "scanning" ? T.scanCaptions[Math.min(3, Math.floor(state.bioProgress / 25))] : "";
    let actions;
    if (st === "set") actions = `<button type="button" class="flow-primary" data-action="bio-continue">${T.continue} ${icon("arrowRight", 17)}</button>`;
    else if (noLock) actions = `<p class="flow-detail warn">${icon("info", 13)} ${T.bioNeedsLock}</p>
      <button type="button" class="flow-primary" data-action="bio-lock-first">${T.setUpLockFirst} ${icon("arrowRight", 17)}</button>
      <button type="button" class="flow-link" data-action="skip-bio">${T.skipForNow}</button>`;
    else actions = `<button type="button" class="flow-primary" data-action="bio-scan" ${st === "scanning" ? "disabled" : ""}>${st === "scanning" ? T.scanning : `${T.enrollNow} ${icon("arrowRight", 17)}`}</button>
      ${state.platformAuth && st !== "scanning" ? `<button type="button" class="flow-secondary" data-action="bio-real">${icon("fingerprint", 16)} ${T.useRealSensor}</button><p class="flow-hint left">${T.realSensorNote}</p>` : ""}
      ${st !== "scanning" ? `<button type="button" class="flow-link" data-action="skip-bio">${T.skipForNow}</button>` : ""}`;

    return `<div class="flow-card">
      <div class="flow-biometric ${st}" aria-hidden="true">${icon("fingerprint", 58, 1.5)}</div>
      ${st === "scanning" ? `<div class="scan-progress" role="progressbar" aria-label="${T.scanning}" aria-valuenow="${state.bioProgress}" aria-valuemin="0" aria-valuemax="100"><span data-w="${state.bioProgress}"></span></div><p class="scan-caption" aria-live="polite">${caption}</p>` : ""}
      <p class="flow-eyebrow">${T.bioEyebrow}</p>
      <h2 tabindex="-1">${st === "set" ? T.bioDoneTitle : T.bioTitle}</h2>
      <p class="flow-text">${T.bioText(state.security.lock.type === "password")}</p>
      ${st === "set" && state.bioNote ? `<div class="flow-state">${icon("check", 16)} ${state.bioNote}</div>` : ""}
      ${detailsToggle(T.bioDetail)}
      ${actions}
    </div>`;
  }

  // Fig. 7 — Encryption default ON
  function encryption() {
    const on = state.security.encryption.status === "enabled";
    const noLock = state.security.lock.status !== "set";
    return `<div class="flow-card">
      <div class="flow-icon brand">${icon("shieldCheck", 25)}</div>
      <p class="flow-eyebrow">${T.encEyebrow}</p>
      <h2 tabindex="-1">${T.encTitle}</h2>
      <p class="flow-text">${T.encText}</p>
      ${detailsToggle(T.encDetail)}
      <div class="flow-state ${on ? "" : "off"}">${icon(on ? "check" : "shieldAlert", 16)} ${on ? T.encOn : T.encOff}</div>
      ${noLock && on ? `<p class="flow-detail warn">${icon("info", 13)} ${T.encNoLock}</p>` : ""}
      <button type="button" class="flow-primary" data-action="enc-keep">${on ? T.keepEncOn : T.turnEncBackOn} ${icon("check", 17)}</button>
      ${on ? `<button type="button" class="flow-link risk" data-action="enc-off">${T.turnOffEnc}</button>` : `<button type="button" class="flow-link" data-action="enc-continue">${T.continueEncOff}</button>`}
    </div>`;
  }

  // Fig. 8 — Setup review (n/6 checks)
  function review() {
    const r = risk();
    const c = checks();
    const row = (id, label, ic) => {
      const full = c[id].every(Boolean);
      const hint = layerHint(id);
      return `<div class="flow-review-row ${full ? "active" : c[id][0] ? "half" : ""}">
        <span class="flow-review-icon">${icon(ic, 17)}</span>
        <span><strong>${label}</strong><small>${statusText[id]()}</small>${id === "lock" && c.lock[0] ? `<small>${optsSummary()}</small>` : ""}${hint ? `<small class="hint">${hint}</small>` : ""}</span>
        ${full ? `${icon("check", 16)}<span class="sr-only">${T.protectedLabel}</span>` : `<button type="button" data-fix="${id}" aria-label="${T.fixNow}: ${label}">${T.fixNow}</button>`}
      </div>`;
    };
    const missing = 6 - r.total;
    return `<div class="flow-card">
      <p class="flow-eyebrow">${T.reviewEyebrow}</p>
      <h2 tabindex="-1">${T.reviewTitle}</h2>
      <p class="flow-text">${T.reviewText}</p>
      <div class="flow-risk ${r.level}">
        <div class="flow-risk-head"><strong>${r.label}</strong><span>${T.checksLine(r.total, r.percent)}</span></div>
        <div class="flow-risk-track" role="progressbar" aria-label="${T.meterLabel}" aria-valuenow="${r.percent}" aria-valuemin="0" aria-valuemax="100"><span data-w="${r.percent}"></span></div>
        <small>${missing ? T.missingChecks(missing) : T.allChecks}</small>
      </div>
      <div class="flow-review-list">
        ${row("lock", T.screenLock, "lock")}
        ${row("biometric", T.biometrics, "fingerprint")}
        ${row("encryption", T.encryption, "shieldCheck")}
      </div>
      <button type="button" class="flow-primary" data-action="save">${T.saveSetup} ${icon("check", 17)}</button>
      ${state.verifier && c.lock[0] ? `<button type="button" class="flow-secondary" data-action="to-test">${icon("lock", 16)} ${T.testLock}</button>` : ""}
      <button type="button" class="flow-link" data-action="to-settings">${T.reviewOrChange}</button>
    </div>`;
  }

  // Fig. 9 — Setup confirmation, with a reminder for anything still off (R3)
  function settings() {
    const c = checks();
    const row = (id, label, ic) => {
      const on = c[id][0];
      const text = id === "lock" && on ? `${T.stOn} · ${statusText.lock()} · ${optsSummary()}` : statusText[id]();
      return `<button type="button" data-fix="${id}"><span class="flow-review-icon">${icon(ic, 17)}</span><span><strong>${label}</strong><small class="${on ? "" : "off"}">${text}</small></span>${icon("arrowRight", 16)}</button>`;
    };
    const off = ["lock", "biometric", "encryption"].filter((id) => !c[id][0]).length;
    const saved = state.saved;
    return `<div class="flow-card">
      <div class="flow-icon brand">${icon("check", 26)}</div>
      <p class="flow-eyebrow">${saved ? T.setupComplete : T.securitySettings}</p>
      <h2 tabindex="-1">${saved ? T.readyTitle : T.glanceTitle}</h2>
      <p class="flow-text">${saved ? T.readyText : T.glanceText}</p>
      ${saved && off ? `<div class="reminder" role="status">${icon("shieldAlert", 18)}<div><strong>${T.reminderTitle(off)}</strong><span>${T.reminderText}</span></div></div>` : ""}
      <div class="flow-settings-list">
        ${row("lock", T.screenLock, "lock")}
        ${row("biometric", T.biometrics, "fingerprint")}
        ${row("encryption", T.encryption, "shieldCheck")}
      </div>
      ${saved ? `<button type="button" class="flow-primary" data-action="done">${T.done} ${icon("check", 17)}</button>` : `<button type="button" class="flow-primary" data-action="save">${T.saveSetup} ${icon("check", 17)}</button>`}
      ${state.verifier && c.lock[0] ? `<button type="button" class="flow-secondary" data-action="to-test">${icon("lock", 16)} ${T.testLock}</button>` : ""}
      <button type="button" class="flow-link" data-action="to-review">${T.reviewOrChange} ${icon("arrowLeft", 16)}</button>
    </div>`;
  }

  /* ---------- Screen lock logic ---------- */
  function chooseLock(type) {
    state.entry = freshEntry();
    if (type === "pin") { state.pinLength = 6; state.customLength = ""; state.pinMore = false; }
    go(type);
  }

  async function lockContinue() {
    const mode = state.screen;
    const e = state.entry;
    if (e.checking) return;

    if (mode === "pattern") {
      if (e.patternFirst === null) {
        if (e.pattern.length < 4) return setError(T.errPatternShort);
        if (Sec.isCommonPattern(e.pattern)) { e.pattern = []; return setError(T.errPatternCommon); }
        e.notice = Sec.startsTopLeft(e.pattern) ? T.noticeTopLeft : "";
        e.patternFirst = e.pattern.join("");
        e.pattern = [];
        e.error = "";
        return render(true);
      }
      if (e.pattern.join("") !== e.patternFirst) { e.pattern = []; return setError(T.errPatternMismatch); }
      return saveLock("pattern", e.patternFirst.length >= 6, e.patternFirst);
    }

    if (!e.confirming) {
      if (mode === "pin") {
        const len = state.pinLength;
        if (!new RegExp(`^\\d{${len}}$`).test(e.first)) return setError(T.errPinLength(len));
        if (Sec.isWeakPin(e.first)) return setError(T.errPinWeak);
      } else {
        if (e.first.length < 8) return setError(T.errPasswordShort);
        if (Sec.passwordStrength(e.first).score < 2) return setError(T.errPasswordWeak);
        // Private breach lookup (k-anonymity).
        e.checking = true;
        e.error = "";
        render();
        const result = await Sec.breachCount(e.first);
        e.checking = false;
        if (state.screen !== "password") return;
        if (result.count > 0) return setError(T.errBreached(result.count));
        e.notice = result.error ? T.breachUnavailable : "";
      }
      e.confirming = true;
      e.error = "";
      return render(true);
    }

    if (e.first !== e.confirm) { e.confirm = ""; return setError(T.errMismatch(mode === "pin")); }
    const strong = mode === "pin" ? state.pinLength >= 6 : Sec.passwordStrength(e.first).score >= 3;
    saveLock(mode, strong, e.first);
  }

  async function saveLock(type, strong, secret) {
    state.security.lock = { type, status: "set", strong, length: type === "pin" ? state.pinLength : secret.length };
    state.entry = freshEntry(); // discard the secret immediately
    state.verifier = null;
    state.test = { attempts: 0, lockedUntil: 0, status: "", pattern: [] };
    if (Sec.canVerify()) {
      try { state.verifier = await Sec.deriveVerifier(secret); } catch { state.verifier = null; }
    }
    secret = null;
    go("lockopts");
  }

  function lockBack() {
    const e = state.entry;
    if ((state.screen === "pattern" && e.patternFirst !== null) || e.confirming) { state.entry = freshEntry(); return render(true); }
    back();
  }

  function setError(message) {
    state.entry.error = message;
    Study.event("error", state.screen);
    render();
    (content.querySelector("#secret") || content.querySelector(".flow-error"))?.focus?.();
  }

  /* ---------- Pattern pad ---------- */
  function drawPattern() {
    const pad = $("pattern-pad");
    if (!pad) return;
    const seq = state.entry.pattern;
    pad.querySelectorAll(".pattern-dot").forEach((d) => d.classList.toggle("visited", seq.includes(Number(d.dataset.dot))));
    $("pattern-line").setAttribute("points", seq.map((i) => `${20 + (i % 3) * 30},${20 + Math.floor(i / 3) * 30}`).join(" "));
    $("pattern-hint").textContent = patternHint();
    renderMeter();
  }

  function addDot(i) {
    const seq = state.entry.pattern;
    if (seq.includes(i)) return;
    seq.push(i);
    if (state.entry.error) { state.entry.error = ""; content.querySelector(".flow-error")?.remove(); }
    drawPattern();
  }

  let dragging = false;
  function dotAt(pad, x, y) {
    const r = pad.getBoundingClientRect();
    const px = ((x - r.left) / r.width) * 100;
    const py = ((y - r.top) / r.height) * 100;
    for (let i = 0; i < 9; i++) {
      const dx = px - (20 + (i % 3) * 30);
      const dy = py - (20 + Math.floor(i / 3) * 30);
      if (dx * dx + dy * dy < 11 * 11) return i;
    }
    return -1;
  }

  content.addEventListener("pointerdown", (event) => {
    const testPad = event.target.closest("#test-pad");
    if (testPad && state.test.lockedUntil <= Date.now()) {
      const i = dotAt(testPad, event.clientX, event.clientY);
      if (i < 0) return;
      event.preventDefault();
      dragging = "test";
      testPad.setPointerCapture?.(event.pointerId);
      if (!state.test.pattern.includes(i)) { state.test.pattern.push(i); drawTestPattern(); }
      return;
    }
    const pad = event.target.closest("#pattern-pad");
    if (!pad) return;
    const i = dotAt(pad, event.clientX, event.clientY);
    if (i < 0) return;
    event.preventDefault();
    dragging = true;
    pad.setPointerCapture?.(event.pointerId);
    addDot(i);
  });
  content.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    if (dragging === "test") {
      const i = dotAt($("test-pad"), event.clientX, event.clientY);
      if (i >= 0 && !state.test.pattern.includes(i)) { state.test.pattern.push(i); drawTestPattern(); }
      return;
    }
    const pad = $("pattern-pad");
    if (!pad) return;
    const i = dotAt(pad, event.clientX, event.clientY);
    if (i >= 0) addDot(i);
  });
  document.addEventListener("pointerup", () => (dragging = false));
  document.addEventListener("pointercancel", () => (dragging = false));

  /* ---------- Biometrics ---------- */
  function startScan() {
    state.bio = "scanning";
    state.bioProgress = 0;
    render();
    scanTimer = setInterval(() => {
      state.bioProgress = Math.min(100, state.bioProgress + 10);
      if (state.bioProgress >= 100) {
        stopScan();
        state.bio = "set";
        state.security.biometric = { status: "set", method: "simulated" };
        state.bioNote = state.bioNote || T.simulatedDone;
        render(true);
        return;
      }
      const bar = content.querySelector(".scan-progress");
      if (bar) {
        bar.setAttribute("aria-valuenow", state.bioProgress);
        bar.firstElementChild.style.width = `${state.bioProgress}%`;
        content.querySelector(".scan-caption").textContent = T.scanCaptions[Math.min(3, Math.floor(state.bioProgress / 25))];
      }
    }, 180);
  }

  function stopScan() {
    clearInterval(scanTimer);
    scanTimer = null;
    if (state.bio === "scanning") state.bio = "unset";
  }

  async function realSensor() {
    try {
      await Sec.verifyWithPlatform();
      state.bio = "set";
      state.security.biometric = { status: "set", method: "real" };
      state.bioNote = T.realSensorDone;
      Study.event("webauthn", "ok");
      render(true);
    } catch {
      // Some browsers block or cancel the passkey prompt. Finish enrollment anyway so the
      // flow matches what the user chose; the study log still records the failure.
      Study.event("webauthn", "failed");
      state.bio = "set";
      state.security.biometric = { status: "set", method: "device" };
      state.bioNote = T.deviceBioDone;
      render(true);
    }
  }

  // The recovery email is required whenever a lock is set, so a forgotten lock can be reset safely.
  function saveRecoveryEmail() {
    const field = $("rec-setup");
    if (!field) return true;
    const email = field.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError(email ? T.recErr.invalid_email : T.recSetupRequired);
      const f = $("rec-setup");
      if (f) { f.value = email; f.focus(); }
      return false;
    }
    if (email !== state.recoveryEmail) Study.event("lockopt", "recovery-email");
    state.recoveryEmail = email;
    state.entry.error = "";
    return true;
  }

  /* ---------- Modals ---------- */
  function openModal(html, onClose) {
    lastFocus = document.activeElement;
    $("modal-root").innerHTML = `<div class="flow-modal-backdrop" data-backdrop>${html}</div>`;
    const dialog = $("modal-root").querySelector('[role="dialog"]');
    releaseTrap = window.trapFocus(dialog, onClose);
    $("modal-root").querySelector("[data-backdrop]").addEventListener("mousedown", (e) => { if (e.target === e.currentTarget) onClose(); });
    dialog.querySelectorAll("[data-close]").forEach((b) => (b.onclick = onClose));
    dialog.querySelector("h2").focus();
    return dialog;
  }

  function closeModal() {
    releaseTrap?.();
    releaseTrap = null;
    $("modal-root").innerHTML = "";
    lastFocus?.isConnected ? lastFocus.focus() : content.querySelector("h2")?.focus();
  }

  function dismissModal() {
    releaseTrap?.();
    releaseTrap = null;
    $("modal-root").innerHTML = "";
  }

  // Informed skip: name the consequence, offer the safer path first (R3).
  function skipModal(target) {
    const copy = target === "lock" ? { title: T.skipLockTitle, body: T.skipLockBody } : { title: T.skipBioTitle, body: T.skipBioBody };
    const dialog = openModal(`<div class="flow-modal" role="dialog" aria-modal="true" aria-labelledby="skip-title" aria-describedby="skip-body">
      <button type="button" class="flow-modal-close" data-close aria-label="${T.close}">${icon("x", 17)}</button>
      <div class="flow-icon warning">${icon("shieldAlert", 23)}</div>
      <h2 id="skip-title" tabindex="-1">${copy.title}</h2>
      <p id="skip-body">${copy.body}</p>
      <p>${T.skipReminder}</p>
      <div class="flow-modal-actions">
        <button type="button" class="flow-primary" data-close>${T.setUpNow}</button>
        <button type="button" class="flow-link" data-confirm>${T.remindLater}</button>
      </div>
    </div>`, closeModal);
    dialog.querySelector("[data-confirm]").onclick = () => {
      dismissModal();
      Study.event("skip", target);
      if (target === "lock") { if (state.security.lock.status !== "set") state.security.lock = { type: null, status: "later", strong: false }; advance("biometric"); }
      else { state.security.biometric.status = "later"; advance("encryption"); }
    };
  }

  // Turning off encryption is the highest-consequence choice: require explicit acknowledgement.
  function encryptionModal() {
    const dialog = openModal(`<div class="flow-modal" role="dialog" aria-modal="true" aria-labelledby="enc-title">
      <button type="button" class="flow-modal-close" data-close aria-label="${T.close}">${icon("x", 17)}</button>
      <div class="flow-icon warning">${icon("shieldAlert", 23)}</div>
      <h2 id="enc-title" tabindex="-1">${T.encModalTitle}</h2>
      <p class="consequence">${T.encModalBody}</p>
      <label class="flow-check"><input type="checkbox" id="enc-ack" /> <span>${T.encModalAck}</span></label>
      <div class="flow-modal-actions">
        <button type="button" class="flow-primary" data-close>${T.keepEncOn} ${icon("check", 17)}</button>
        <button type="button" class="flow-link risk" id="enc-confirm" disabled>${T.turnOffEnc}</button>
      </div>
    </div>`, closeModal);
    const ack = dialog.querySelector("#enc-ack");
    const confirm = dialog.querySelector("#enc-confirm");
    ack.onchange = () => (confirm.disabled = !ack.checked);
    confirm.onclick = () => {
      dismissModal();
      Study.event("skip", "encryption");
      state.security.encryption.status = "declined";
      render(true);
    };
  }

  /* ---------- Events ---------- */
  content.addEventListener("click", (event) => {
    const el = event.target.closest("button, a");
    if (!el || el.disabled) return;
    const d = el.dataset;
    if (d.lock) return chooseLock(d.lock);
    if (d.fix) return editLayer(d.fix);
    if (d.dot !== undefined) return addDot(Number(d.dot));
    if (d.tdot !== undefined) {
      const i = Number(d.tdot);
      if (!state.test.pattern.includes(i)) state.test.pattern.push(i);
      return drawTestPattern();
    }
    if (d.len) {
      state.pinLength = Number(d.len);
      state.customLength = "";
      state.entry = freshEntry();
      render();
      content.querySelector(`[data-len="${d.len}"]`).focus();
      return;
    }
    switch (d.action) {
      case "start": return go("lock");
      case "details":
        state.details = !state.details;
        if (state.details) Study.event("details", state.screen);
        render();
        content.querySelector('[data-action="details"]').focus();
        return;
      case "pin-more":
        state.pinMore = !state.pinMore;
        if (state.pinMore) Study.event("details", "pin-lengths");
        render();
        content.querySelector('[data-action="pin-more"]').focus();
        return;
      case "skip-lock": return skipModal("lock");
      case "skip-bio": return skipModal("biometric");
      case "lock-continue": return lockContinue();
      case "lock-back": return lockBack();
      case "clear-pattern":
        state.entry.pattern = [];
        drawPattern();
        return;
      case "reveal": {
        state.entry.reveal = !state.entry.reveal;
        $("secret").type = state.entry.reveal ? "text" : "password";
        el.textContent = state.entry.reveal ? T.hide : T.show;
        el.setAttribute("aria-pressed", state.entry.reveal);
        return;
      }
      case "rec-start":
        state.recovery = { stage: "email", email: "", token: "", error: "", busy: false, code: "" };
        Study.event("recovery", "start");
        render(true);
        return;
      case "rec-send": return recoverySend();
      case "rec-verify": return recoveryVerify();
      case "rec-other":
        state.recovery = { stage: "email", email: "", token: "", error: "", busy: false, code: "" };
        return render(true);
      case "rec-cancel":
        state.recovery = null;
        if (state.test.lockedUntil > Date.now()) startLockoutTimer();
        else state.test.status = "";
        return render(true);
      case "rec-newlock":
        state.security.lock = { type: null, status: "unset", strong: false };
        state.verifier = null;
        state.recovery = null;
        state.test = { attempts: 0, lockedUntil: 0, status: "", pattern: [] };
        clearInterval(testTimer);
        // After recovery, set the new lock then go straight to the review, so the user
        // can finish (and copy results) instead of redoing the whole setup.
        state.returnToReview = true;
        state.recovered = true;
        return go("lock");
      case "opts-continue": return saveRecoveryEmail() && advance("biometric");
      case "to-test": return state.screen === "lockopts" && !saveRecoveryEmail() ? undefined : go("locktest");
      case "test-back": return back();
      case "test-unlock": return testUnlock();
      case "skip-wait":
        state.test.lockedUntil = 0;
        state.test.status = "";
        clearInterval(testTimer);
        render();
        return $("test-secret")?.focus();
      case "bio-scan": state.bioNote = ""; return startScan();
      case "bio-real": return realSensor();
      case "bio-lock-first": return go("lock");
      case "bio-continue": return advance("encryption");
      case "enc-keep":
        state.security.encryption.status = "enabled";
        return advance("review");
      case "enc-continue": return advance("review");
      case "enc-off": return encryptionModal();
      case "save":
        state.saved = true;
        return go("settings");
      case "to-settings": return go("settings");
      case "to-review": return go("review");
      case "done": {
        const r = risk();
        if (!Study.finish({ summary: `${r.label} – ${r.summary}`, checks: r.total })) location.href = "index.html";
      }
    }
  });

  content.addEventListener("input", (event) => {
    const t = event.target;
    const e = state.entry;
    if (t.id === "secret") {
      if (state.screen === "pin") t.value = t.value.replace(/\D/g, "");
      e.confirming ? (e.confirm = t.value) : (e.first = t.value);
      const meter = $("strength");
      if (meter) {
        meter.dataset.level = strengthLevel(e.first);
        meter.innerHTML = strengthMarkup(e.first);
      }
      renderMeter();
    } else if (t.id === "rec-code" && state.recovery) {
      t.value = t.value.replace(/\D/g, "").slice(0, 6);
      state.recovery.code = t.value;
      if (state.recovery.error) { state.recovery.error = ""; content.querySelector(".flow-error")?.remove(); }
    } else if (t.id === "rec-setup") {
      // Save as soon as it's valid, so "Test your lock" works without pressing Continue first.
      const v = t.value.trim();
      if (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) state.recoveryEmail = v;
    } else if (t.id === "custom-len") {
      t.value = t.value.replace(/\D/g, "").slice(0, 2);
      state.customLength = t.value;
      const n = Number(t.value);
      if (n >= 4 && n <= 12 && n !== state.pinLength) {
        state.pinLength = n;
        state.entry = freshEntry();
        render();
        const input = $("custom-len");
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  });

  content.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.id === "secret") { event.preventDefault(); lockContinue(); }
    if (event.key === "Enter" && event.target.id === "test-secret") { event.preventDefault(); testUnlock(); }
    if (event.key === "Enter" && event.target.id === "rec-setup") { event.preventDefault(); content.querySelector('[data-action="opts-continue"]').click(); }
    if (event.key === "Enter" && event.target.id === "rec-code") { event.preventDefault(); recoveryVerify(); }
  });

  content.addEventListener("change", (event) => {
    const t = event.target;
    if (t.name === "notif") state.lockOptions.notif = t.value;
    else if (t.name === "autolock") state.lockOptions.autoLock = Number(t.value);
    else if (t.id === "show-pattern") { state.lockOptions.showPattern = t.checked; return; }
    else return;
    Study.event("lockopt", `${t.name}=${t.value}`);
    render();
    content.querySelector(`input[name="${t.name}"]:checked`)?.focus();
  });

  $("flow-back").addEventListener("click", back);

  /* ---------- Init ---------- */
  document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = T[el.dataset.t]));
  $("flow-back").setAttribute("aria-label", T.goBack);
  window.hydrateIcons();
  window.mountTools($("tools-slot"), () => window.readableText(content));
  Sec.platformAuthAvailable().then((ok) => {
    state.platformAuth = ok;
    if (ok && state.screen === "biometric") render();
  });
  window.startIdleWipe();
  Study.start("redesign");
  Study.screen("welcome");
  render();
})();
