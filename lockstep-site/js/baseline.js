// Baseline flow: a reconstruction of the conventional default setup pattern described in the
// proposal — bare options, fixed 4-digit PIN, 4-character password, silent "Skip", automatic
// (unshown) encryption, and no summary at the end. Used only for comparison testing.
(function () {
  const $ = (id) => document.getElementById(id);
  const T = window.T;
  const Study = window.Study;
  // No encryption screen, matching current phones: Android 10+ (file-based encryption) and
  // iPhone (Data Protection) encrypt storage automatically. Round 1 used an off-by-default toggle.
  const content = $("flow-content");

  const S = {
    en: {
      lockTitle: "Set a screen lock", lockText: "Choose a screen lock.",
      pin: "PIN", pattern: "Pattern", password: "Password", none: "None",
      skip: "Skip", next: "Next", back: "Back", ok: "OK",
      enterPin: "Enter a 4-digit PIN", confirmPin: "Re-enter PIN",
      enterPw: "Enter password", confirmPw: "Re-enter password",
      drawPattern: "Draw an unlock pattern", confirmPattern: "Draw pattern again",
      tapDots: (n) => `${n} dots selected`, clear: "Clear",
      errPin: "PIN must be 4 digits.", errPw: "Must be at least 4 characters.", errPattern: "Connect at least 4 dots.", errMatch: "Doesn’t match. Try again.",
      bioTitle: "Fingerprint unlock", bioText: "Add a fingerprint.", addFp: "Add fingerprint", touchSensor: "Touch the sensor", fpAdded: "Fingerprint added.",
      encTitle: "Encryption", encText: "Encrypt device.", encToggle: "Encryption",
      doneTitle: "Setup complete", doneText: "Your device is ready.", finish: "Finish",
      dot: (n) => `Dot ${n}`,
    },
    fil: {
      lockTitle: "Mag-set ng screen lock", lockText: "Pumili ng screen lock.",
      pin: "PIN", pattern: "Pattern", password: "Password", none: "Wala",
      skip: "Laktawan", next: "Susunod", back: "Bumalik", ok: "OK",
      enterPin: "Maglagay ng 4-numerong PIN", confirmPin: "Ilagay muli ang PIN",
      enterPw: "Ilagay ang password", confirmPw: "Ilagay muli ang password",
      drawPattern: "Gumuhit ng unlock pattern", confirmPattern: "Iguhit muli ang pattern",
      tapDots: (n) => `${n} tuldok ang napili`, clear: "Burahin",
      errPin: "Dapat 4 na numero ang PIN.", errPw: "Hindi bababa sa 4 na karakter.", errPattern: "Pagdugtungin ang hindi bababa sa 4 na tuldok.", errMatch: "Hindi tugma. Subukan muli.",
      bioTitle: "Fingerprint unlock", bioText: "Magdagdag ng fingerprint.", addFp: "Magdagdag ng fingerprint", touchSensor: "Hawakan ang sensor", fpAdded: "Naidagdag ang fingerprint.",
      encTitle: "Encryption", encText: "I-encrypt ang device.", encToggle: "Encryption",
      doneTitle: "Tapos na ang setup", doneText: "Handa na ang device mo.", finish: "Tapusin",
      dot: (n) => `Tuldok ${n}`,
    },
  }[T.lang];

  const state = { screen: "lock", lockType: null, first: "", confirming: false, error: "", pattern: [], lock: "none", bio: false, enc: true, fpScanning: false };

  function go(screen) {
    state.screen = screen;
    state.first = "";
    state.confirming = false;
    state.error = "";
    state.pattern = [];
    window.stopReading?.();
    Study.screen(`base-${screen}`);
    render();
    content.querySelector("h2")?.focus({ preventScroll: true });
  }

  function render() {
    const views = { lock, pin: entry, password: entry, pattern, biometric, encryption, done };
    content.innerHTML = `<div class="base-card">${views[state.screen]()}</div>`;
  }

  const err = () => (state.error ? `<p class="base-error" role="alert">${state.error}</p>` : "");

  function lock() {
    return `<h2 tabindex="-1">${S.lockTitle}</h2><p>${S.lockText}</p>
      <div class="base-list">
        <button type="button" data-lock="pin">${S.pin}</button>
        <button type="button" data-lock="pattern">${S.pattern}</button>
        <button type="button" data-lock="password">${S.password}</button>
        <button type="button" data-lock="none">${S.none}</button>
      </div>
      <div class="base-actions"><span></span><button type="button" class="base-btn text" data-act="skip-lock">${S.skip}</button></div>`;
  }

  function entry() {
    const pin = state.screen === "pin";
    const title = pin ? (state.confirming ? S.confirmPin : S.enterPin) : state.confirming ? S.confirmPw : S.enterPw;
    return `<h2 tabindex="-1">${title}</h2>
      <input class="base-input" id="base-secret" type="password" ${pin ? 'inputmode="numeric" maxlength="4"' : 'maxlength="64"'} autocomplete="off" aria-label="${title}" />
      ${err()}
      <div class="base-actions"><button type="button" class="base-btn text" data-act="back">${S.back}</button><button type="button" class="base-btn" data-act="entry-next">${S.next}</button></div>`;
  }

  function pattern() {
    const title = state.confirming ? S.confirmPattern : S.drawPattern;
    return `<h2 tabindex="-1">${title}</h2>
      <div class="flow-pattern" role="group" aria-label="${title}">
        ${Array.from({ length: 9 }, (_, i) => `<button type="button" class="pattern-dot ${state.pattern.includes(i) ? "visited" : ""}" data-dot="${i}" aria-label="${S.dot(i + 1)}"><span></span></button>`).join("")}
      </div>
      <p>${S.tapDots(state.pattern.length)}</p>
      ${err()}
      <div class="base-actions"><button type="button" class="base-btn text" data-act="clear">${S.clear}</button><button type="button" class="base-btn" data-act="pattern-next">${S.next}</button></div>`;
  }

  function biometric() {
    return `<h2 tabindex="-1">${S.bioTitle}</h2><p>${state.bio ? S.fpAdded : state.fpScanning ? S.touchSensor : S.bioText}</p>
      <div class="flow-biometric ${state.fpScanning ? "scanning" : state.bio ? "set" : ""}" aria-hidden="true">${window.icon("fingerprint", 58, 1.5)}</div>
      <div class="base-actions">
        ${state.bio ? `<span></span><button type="button" class="base-btn" data-act="to-enc">${S.next}</button>` : `<button type="button" class="base-btn text" data-act="skip-bio">${S.skip}</button><button type="button" class="base-btn" data-act="add-fp" ${state.fpScanning ? "disabled" : ""}>${S.addFp}</button>`}
      </div>`;
  }

  function encryption() {
    return `<h2 tabindex="-1">${S.encTitle}</h2><p>${S.encText}</p>
      <label class="base-toggle"><span>${S.encToggle}</span><input type="checkbox" id="base-enc" role="switch" ${state.enc ? "checked" : ""} /></label>
      <div class="base-actions"><span></span><button type="button" class="base-btn" data-act="to-done">${S.next}</button></div>`;
  }

  function done() {
    return `<h2 tabindex="-1">${S.doneTitle}</h2><p>${S.doneText}</p>
      <div class="base-actions"><span></span><button type="button" class="base-btn" data-act="finish">${S.finish}</button></div>`;
  }

  function setError(msg) {
    state.error = msg;
    Study.event("error", state.screen);
    render();
    content.querySelector("#base-secret")?.focus();
  }

  function summary() {
    const parts = [state.lock === "none" ? "No lock" : S[state.lock], state.bio && "Biometrics", state.enc && "Encryption"].filter(Boolean);
    // Same 6-check scoring as the redesign, so results are comparable.
    const lockSet = state.lock !== "none";
    const checks = (lockSet ? 1 : 0) + (state.bio ? 1 + (lockSet ? 1 : 0) : 0) + (state.enc ? 1 + (lockSet ? 1 : 0) : 0);
    return { summary: parts.join(" + "), checks };
  }

  content.addEventListener("click", (event) => {
    const el = event.target.closest("button");
    if (!el || el.disabled) return;
    const d = el.dataset;
    if (d.lock) {
      if (d.lock === "none") { state.lock = "none"; Study.event("skip", "lock"); return go("biometric"); }
      state.lockType = d.lock;
      return go(d.lock);
    }
    if (d.dot !== undefined) {
      const i = Number(d.dot);
      if (!state.pattern.includes(i)) state.pattern.push(i);
      state.error = "";
      return render();
    }
    switch (d.act) {
      case "skip-lock": state.lock = "none"; Study.event("skip", "lock"); return go("biometric");
      case "back": Study.event("back", state.screen); return go("lock");
      case "clear": state.pattern = []; return render();
      case "entry-next": {
        const val = $("base-secret").value;
        const pin = state.screen === "pin";
        if (!state.confirming) {
          if (pin ? !/^\d{4}$/.test(val) : val.length < 4) return setError(pin ? S.errPin : S.errPw);
          state.first = val;
          state.confirming = true;
          state.error = "";
          render();
          return $("base-secret").focus();
        }
        if (val !== state.first) { state.confirming = false; state.first = ""; return setError(S.errMatch); }
        state.lock = state.screen;
        return go("biometric");
      }
      case "pattern-next": {
        if (state.pattern.length < 4) return setError(S.errPattern);
        if (!state.confirming) { state.first = state.pattern.join(""); state.pattern = []; state.confirming = true; state.error = ""; return render(); }
        if (state.pattern.join("") !== state.first) { state.pattern = []; state.confirming = false; state.first = ""; return setError(S.errMatch); }
        state.lock = "pattern";
        return go("biometric");
      }
      case "skip-bio": Study.event("skip", "biometric"); return go("done");
      case "add-fp":
        state.fpScanning = true;
        render();
        setTimeout(() => { state.fpScanning = false; state.bio = true; render(); }, 1600);
        return;
      case "to-enc": return go("done");
      case "to-done":
        state.enc = $("base-enc").checked;
        if (!state.enc) Study.event("skip", "encryption");
        return go("done");
      case "finish":
        if (!Study.finish(summary())) location.href = "index.html";
    }
  });

  content.addEventListener("input", (e) => {
    if (e.target.id === "base-secret" && state.screen === "pin") e.target.value = e.target.value.replace(/\D/g, "");
  });
  content.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "base-secret") { e.preventDefault(); content.querySelector('[data-act="entry-next"]').click(); }
  });

  document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = T[el.dataset.t]));
  window.hydrateIcons();
  window.mountTools($("tools-slot"), () => window.readableText(content) || content.innerText);
  window.startIdleWipe();
  Study.start("baseline");
  Study.screen("base-lock");
  render();
})();
