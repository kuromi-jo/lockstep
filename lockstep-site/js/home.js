// Lockstep landing page: a non-interactive tour of the real setup screens, the protection
// map, and the tradeoff simulator. Nothing is stored or sent anywhere.
(function () {
  const $ = (id) => document.getElementById(id);
  const icon = window.icon;
  const esc = window.escapeHtml;

  // Each slide mirrors a screen in setup.html (same copy as the real flow).
  const slides = [
    {
      id: "lock", label: "Screen lock",
      meter: { label: "Weak", level: "weak", w: 33, text: "Weak – No lock set · Encryption" },
      body: () => `
        <div class="flow-icon">${icon("lock", 25)}</div>
        <p class="flow-eyebrow">Screen lock · step 1 of 4</p>
        <h2 tabindex="-1">Keep your apps private.</h2>
        <p class="flow-text">A screen lock stops people who pick up your phone from opening your messages, photos, or accounts.</p>
        <div class="tour-options" aria-hidden="true">
          <span><b>PIN</b><small>6 digits recommended</small>${icon("arrowRight", 15)}</span>
          <span><b>Pattern</b><small>Quick, but easier to watch over your shoulder</small>${icon("arrowRight", 15)}</span>
          <span><b>Password</b><small>Strongest protection</small>${icon("arrowRight", 15)}</span>
        </div>
        <p class="tour-note">Weak PINs like 1234 are blocked, passwords are checked against known data breaches, and skipping asks you to confirm the risk first.</p>`,
    },
    {
      id: "biometric", label: "Biometrics",
      meter: { label: "Moderate", level: "moderate", w: 67, text: "Moderate – PIN + Encryption" },
      body: () => `
        <div class="flow-biometric" aria-hidden="true">${icon("fingerprint", 58, 1.5)}</div>
        <p class="flow-eyebrow">Biometrics · step 2 of 4</p>
        <h2 tabindex="-1">Unlock faster, safely.</h2>
        <p class="flow-text">Face or fingerprint unlock is a quick way to prove it’s you, so you type your PIN less often where others can see it.</p>
        <p class="tour-note">Needs a screen lock as backup. On supported devices you can use the real fingerprint or face sensor; it never leaves the device.</p>`,
    },
    {
      id: "encryption", label: "Encryption",
      meter: { label: "Strong", level: "strong", w: 100, text: "Strong – PIN + Biometrics + Encryption" },
      body: () => `
        <div class="flow-icon brand">${icon("shieldCheck", 25)}</div>
        <p class="flow-eyebrow">Encryption · step 3 of 4</p>
        <h2 tabindex="-1">Keep your data unreadable.</h2>
        <p class="flow-text">Encryption scrambles your data so it’s unreadable without your lock code — even if your phone is lost or stolen.</p>
        <div class="flow-state" aria-hidden="true">${icon("check", 16)} On — recommended</div>
        <p class="tour-note">On by default. Turning it off takes a deliberate, clearly labelled step and a checked acknowledgement.</p>`,
    },
    {
      id: "review", label: "Review",
      meter: { label: "Strong", level: "strong", w: 100, text: "Strong – PIN + Biometrics + Encryption" },
      body: () => `
        <p class="flow-eyebrow">Setup review · step 4 of 4</p>
        <h2 tabindex="-1">Save your security setup.</h2>
        <div class="flow-risk strong" aria-hidden="true">
          <div class="flow-risk-head"><strong>Strong</strong><span>6 / 6 checks · 100% coverage</span></div>
          <div class="flow-risk-track"><span data-w="100"></span></div>
        </div>
        <div class="tour-rows" aria-hidden="true">
          <span>${icon("lock", 15)} Screen lock <small>PIN · notifications hidden</small></span>
          <span>${icon("fingerprint", 15)} Biometrics <small>On</small></span>
          <span>${icon("shieldCheck", 15)} Encryption <small>On</small></span>
        </div>
        <p class="tour-note">Anything skipped shows “Fix now”. You can also test your lock here and see how the phone slows down guessers.</p>`,
    },
  ];

  const initialSecurity = () => ({ lock: false, biometric: false, encryption: true });
  const state = { slide: 0, security: initialSecurity(), chartPoint: 0 };
  let toastTimer = null;

  /* ---------- Tour ---------- */
  function renderTour(focusHeading) {
    const i = state.slide;
    const s = slides[i];
    $("step-count").textContent = `${String(i + 1).padStart(2, "0")} / 04`;
    $("prev-step").disabled = i === 0;
    $("step-rail").innerHTML = slides
      .map((sl, n) => `<button type="button" class="rail-segment ${n <= i ? "is-active" : ""}" data-slide="${n}" aria-label="Show ${sl.label}" ${n === i ? 'aria-current="step"' : ""}></button>`)
      .join("");
    $("meter-label").textContent = s.meter.label;
    $("meter-message").textContent = s.meter.text;
    $("meter-fill").style.width = `${s.meter.w}%`;
    $("meter-box").className = `security-meter ${s.meter.level}`;

    const last = i === slides.length - 1;
    $("phone-content").innerHTML = `<div class="step-content tour">
      ${s.body()}
      <div class="step-actions">
        ${last ? `<a class="primary-button no-underline" href="setup.html">Start the real setup ${icon("arrowRight", 17)}</a>`
          : `<button type="button" class="primary-button" data-action="next">Next screen ${icon("arrowRight", 17)}</button>`}
        ${last ? "" : '<a class="text-button" href="setup.html">Skip the tour and start setup</a>'}
      </div>
    </div>`;
    window.applyWidths($("phone-content"));
    if (focusHeading) $("phone-content").querySelector("h2")?.focus();
  }

  function goSlide(n) {
    state.slide = Math.max(0, Math.min(slides.length - 1, n));
    renderTour(true);
  }

  /* ---------- Protection map (mirrors the simulator) ---------- */
  function renderStatus() {
    const sec = state.security;
    const rows = [
      { id: "lock", slide: 0, label: "Screen lock", icon: "lock", desc: "Blocks casual access" },
      { id: "biometric", slide: 1, label: "Biometrics", icon: "fingerprint", desc: "Makes unlocking faster" },
      { id: "encryption", slide: 2, label: "Encryption", icon: "shieldCheck", desc: "Protects stored data at rest" },
    ];
    $("status-list").innerHTML = rows
      .map((r) => `<button type="button" class="status-row" data-slide="${r.slide}">
        <span class="status-icon ${sec[r.id] ? "active" : ""}">${icon(r.icon, 19)}</span>
        <span class="status-copy"><strong>${r.label}</strong><small>${r.desc}</small></span>
        <span class="status-state ${sec[r.id] ? "active" : ""}">${sec[r.id] ? "ON" : "OFF"}</span>
      </button>`)
      .join("");
  }

  /* ---------- Simulator ---------- */
  const enabledCount = () => Object.values(state.security).filter(Boolean).length;

  function chartPoints() {
    const s = state.security;
    return [
      { label: "Screen lock", short: "Lock", protection: s.lock ? 72 : 8, ease: s.lock ? 62 : 94, state: s.lock ? "On" : "Off" },
      { label: "Biometrics", short: "Bio", protection: s.biometric ? 88 : 18, ease: s.biometric ? 92 : 68, state: s.biometric ? "On" : "Off" },
      { label: "Encryption", short: "Encrypt", protection: s.encryption ? 96 : 12, ease: s.encryption ? 84 : 96, state: s.encryption ? "On" : "Off" },
    ];
  }

  function renderSimulator(focusPoint) {
    const s = state.security;
    const count = enabledCount();
    const protection = Math.round((count / 3) * 100);
    const ease = Math.min(100, 48 + (s.biometric ? 30 : 0) + (s.lock ? 14 : 0) + (s.encryption ? 8 : 0));

    $("sim-headline").textContent = protection === 100 ? "A strong, low-friction baseline." : protection >= 66 ? "A balanced setup with one gap." : "Easy to skip, easy to regret.";
    $("sim-copy").textContent = protection === 100
      ? "Three protections are working together: your phone is harder to open, easier to unlock, and safer if it is lost."
      : s.lock
        ? "A screen lock does the heavy lifting. Add biometrics for speed, or keep encryption on for the quiet layer."
        : "Convenience is high right now, but the phone has fewer barriers if someone else picks it up.";

    const scoreBar = (label, value, tone, caption) => `<div class="score-bar">
      <div class="score-heading"><span>${label}</span><strong>${value}%</strong></div>
      <div class="score-track ${tone}" role="progressbar" aria-label="${label}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"><span data-w="${value}"></span></div>
      <small>${caption}</small>
    </div>`;

    const controls = [
      { id: "lock", label: "Screen lock", note: "Stops casual access", icon: "lock" },
      { id: "biometric", label: "Biometrics", note: "Makes unlocking faster", icon: "fingerprint" },
      { id: "encryption", label: "Encryption", note: "Protects stored data", icon: "shieldCheck" },
    ]
      .map((c) => `<button type="button" class="simulator-control ${s[c.id] ? "enabled" : ""}" data-toggle="${c.id}" aria-pressed="${s[c.id]}">
        <span class="sim-control-icon">${icon(c.icon, 18)}</span>
        <span><strong>${c.label}</strong><small>${c.note}</small></span>
        <span class="toggle ${s[c.id] ? "on" : ""}"><span></span></span>
      </button>`)
      .join("");

    $("simulator-card").innerHTML = `
      <div class="simulator-card-top">
        <div><p class="panel-label label-caps">A conversation aid</p><h3>Protection is layered.</h3></div>
        <span class="simulator-count">${count} / 3 on</span>
      </div>
      <div class="simulator-scores">
        ${scoreBar("Protection", protection, "citron", protection >= 66 ? "More barriers against misuse" : "Fewer barriers against misuse")}
        ${scoreBar("Everyday ease", ease, "sage", ease >= 80 ? "Fast and familiar" : "A little more effort")}
      </div>
      ${chartMarkup()}
      <div class="simulator-controls">${controls}</div>
      <p class="simulator-footnote">${icon("info", 14)} The scores are illustrative, not a measurement of actual device security.</p>`;
    window.applyWidths($("simulator-card"));

    if (focusPoint) $("simulator-card").querySelector(`.chart-dot[data-point="${state.chartPoint}"]`)?.focus();
  }

  function chartMarkup() {
    const points = chartPoints();
    const x = (i) => 52 + i * 158;
    const y = (v) => 126 - v * 0.92;
    const path = (key) => points.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p[key])}`).join(" ");
    const sel = points[state.chartPoint];
    const grid = [25, 50, 75, 100].map((v) => `<line x1="35" x2="410" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="0" y="${y(v) + 4}" class="chart-axis">${v}</text>`).join("");
    const dots = points
      .map((p, i) => {
        const active = i === state.chartPoint;
        const dot = (key, cls) => `<circle cx="${x(i)}" cy="${y(p[key])}" r="${active ? 7 : 5}" class="chart-dot ${cls}" data-point="${i}" tabindex="${active ? 0 : -1}" role="button" aria-label="${p.label} ${key === "ease" ? "everyday ease" : "protection"} ${p[key]} percent"/>`;
        return `<g data-hover="${i}">${dot("protection", "chart-dot-protection")}${dot("ease", "chart-dot-ease")}<text x="${x(i)}" y="146" text-anchor="middle" class="chart-label">${p.short}</text></g>`;
      })
      .join("");
    const rows = points.map((p) => `<tr><th scope="row">${p.label}</th><td>${p.state}</td><td>${p.protection}%</td><td>${p.ease}%</td></tr>`).join("");

    return `<div class="tradeoff-chart">
      <div class="chart-heading label-caps"><span>Impact by layer</span><span class="chart-legend"><i class="legend-protection"></i> Protection <i class="legend-ease"></i> Ease</span></div>
      <div class="chart-tooltip" role="status"><strong>${sel.label} · ${sel.state}</strong><span>Protection ${sel.protection}% · Everyday ease ${sel.ease}%</span></div>
      <p class="chart-keyboard-hint">Focus a point, then use arrow keys to move between layers.</p>
      <svg viewBox="0 0 420 150" role="img" aria-labelledby="chart-title chart-desc">
        <title id="chart-title">Protection and everyday ease by security layer</title>
        <desc id="chart-desc">Select a layer point to inspect its illustrative values. The lines update as layers are turned on or off.</desc>
        ${grid}
        <path d="${path("protection")}" class="chart-line chart-line-protection"/>
        <path d="${path("ease")}" class="chart-line chart-line-ease"/>
        ${dots}
      </svg>
      <details class="chart-data"><summary>View exact values</summary>
        <table><caption>Illustrative simulator values by security layer</caption>
          <thead><tr><th scope="col">Layer</th><th scope="col">State</th><th scope="col">Protection</th><th scope="col">Everyday ease</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>
    </div>`;
  }

  function showToast(message) {
    $("toast-root").innerHTML = `<div class="toast" role="status">${icon("check", 16)} ${esc(message)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast-root").innerHTML = ""), 2800);
  }

  function resetDemo() {
    state.security = initialSecurity();
    state.chartPoint = 0;
    renderStatus();
    renderSimulator();
    goSlide(0);
    showToast("Demo reset");
  }

  /* ---------- Events ---------- */
  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-slide], [data-toggle], [data-action], [data-hover] circle");
    if (!el) return;
    if (el.dataset.slide !== undefined) {
      goSlide(Number(el.dataset.slide));
      if (el.classList.contains("status-row")) $("workspace").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (el.dataset.toggle) {
      state.security[el.dataset.toggle] = !state.security[el.dataset.toggle];
      renderStatus();
      renderSimulator();
      $("simulator-card").querySelector(`[data-toggle="${el.dataset.toggle}"]`)?.focus();
      return;
    }
    if (el.dataset.point) { state.chartPoint = Number(el.dataset.point); return renderSimulator(true); }
    if (el.dataset.action === "next") goSlide(state.slide + 1);
  });

  $("simulator-card").addEventListener("mouseover", (event) => {
    const g = event.target.closest("[data-hover]");
    if (!g || Number(g.dataset.hover) === state.chartPoint) return;
    state.chartPoint = Number(g.dataset.hover);
    const p = chartPoints()[state.chartPoint];
    $("simulator-card").querySelector(".chart-tooltip").innerHTML = `<strong>${p.label} · ${p.state}</strong><span>Protection ${p.protection}% · Everyday ease ${p.ease}%</span>`;
  });

  $("simulator-card").addEventListener("keydown", (event) => {
    if (!event.target.classList.contains("chart-dot")) return;
    const n = 3;
    const i = Number(event.target.dataset.point);
    const moves = { ArrowRight: (i + 1) % n, ArrowDown: (i + 1) % n, ArrowLeft: (i + n - 1) % n, ArrowUp: (i + n - 1) % n, Home: 0, End: n - 1 };
    if (event.key in moves) {
      event.preventDefault();
      state.chartPoint = moves[event.key];
      renderSimulator(true);
    } else if (event.key === "Enter" || event.key === " ") event.preventDefault();
  });

  $("prev-step").onclick = () => goSlide(state.slide - 1);
  $("how-it-works").onclick = () => showToast("This is a tour of the real setup screens — start setup to try them");
  $("reset-demo").onclick = resetDemo;
  $("explore-map").onclick = () => $("workspace").scrollIntoView({ behavior: "smooth", block: "start" });

  window.hydrateIcons();
  renderTour();
  renderStatus();
  renderSimulator();
})();
