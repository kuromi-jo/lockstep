// Session metrics (always on, in memory only) with a copyable summary at the end.
// Study mode (?study=1) adds neutral page titles and form-specific wording for the usability test;
// then shows a copyable results summary for the Google Form.
// Nothing is sent anywhere or saved in the browser; the researcher copies the results.
(function () {
  const T = window.T;
  const enabled = new URLSearchParams(location.search).get("study") === "1";
  // Bump this after each round of improvements so retest results can be told apart.
  const BUILD = new URLSearchParams(location.search).get("v") === "1.1" ? "1.1" : "1.0";

  const data = {
    flow: "",
    startedAt: 0,
    screenTimes: {}, // screen -> ms spent
    current: null,
    currentSince: 0,
    events: [], // { t, type, detail }
  };

  function now() { return performance.now(); }

  function start(flow) {
    data.flow = flow;
    data.startedAt = now();
  }

  function screen(name) {
    const t = now();
    if (data.current) data.screenTimes[data.current] = (data.screenTimes[data.current] || 0) + (t - data.currentSince);
    data.current = name;
    data.currentSince = t;
  }

  function event(type, detail = "") {
    data.events.push({ t: Math.round((now() - data.startedAt) / 1000), type, detail });
  }

  const count = (type) => data.events.filter((e) => e.type === type).length;
  const secs = (ms) => `${Math.round(ms / 1000)}s`;

  function finish(outcome) {
    screen("end");
    const totalMs = now() - data.startedAt;
    const root = document.getElementById("modal-root");
    const perScreen = Object.entries(data.screenTimes).filter(([k]) => k !== "end").map(([k, v]) => `${k}=${secs(v)}`).join(", ");
    const totalS = Math.round(totalMs / 1000);
    const checks = outcome.checks ?? 0;
    const level = checks >= 5 ? "strong" : checks >= 3 ? "moderate" : "weak";
    const summary = [
      `Lockstep session results (build ${BUILD})`,
      `Flow: ${data.flow}  ·  Language: ${T.lang}`,
      `Total time: ${secs(totalMs)}`,
      `Final protection: ${outcome.summary}`,
      `Checks covered: ${checks} / 6`,
      `Skips: ${count("skip")}  ·  Errors: ${count("error")}  ·  "More details" opened: ${count("details")}  ·  Fix-now used: ${count("fix")}  ·  Back presses: ${count("back")}`,
      `Time per screen: ${perScreen}`,
      `Event log: ${data.events.map((e) => `[${e.t}s] ${e.type}${e.detail ? `:${e.detail}` : ""}`).join(" ")}`,
      "",
      "Spreadsheet row (tab-separated):",
      [BUILD, data.flow, T.lang, totalS, checks, count("skip"), count("error"), count("details"), count("fix")].join("\t"),
      "Columns: build, flow, lang, total_s, checks, skips, errors, details, fixes",
    ].join("\n");

    const tile = (value, label, tone = "") => `<div class="rs-tile ${tone}"><strong>${value}</strong><span>${label}</span></div>`;
    const fmtTime = totalS >= 60 ? `${Math.floor(totalS / 60)}m ${totalS % 60}s` : `${totalS}s`;

    root.innerHTML = `<div class="flow-modal-backdrop"><div class="flow-modal study-modal" role="dialog" aria-modal="true" aria-labelledby="study-title">
      <div class="rs-head">
        <div class="flow-icon brand">${window.icon("check", 24)}</div>
        ${enabled ? `<p class="study-badge">${T.studyBadge}</p>` : ""}
      </div>
      <h2 id="study-title" tabindex="-1">${enabled ? T.studyDoneTitle : T.demoDoneTitle}</h2>
      <p class="rs-intro">${enabled ? T.studyDoneText : T.demoDoneText}</p>
      <div class="rs-protect ${level}">
        <div><span>${T.rsProtection}</span><strong>${window.escapeHtml(outcome.summary)}</strong></div>
        <b>${checks}<small>/6</small></b>
      </div>
      <div class="rs-grid">
        ${tile(fmtTime, T.rsTime)}
        ${tile(count("skip"), T.rsSkips, count("skip") ? "warn" : "")}
        ${tile(count("error"), T.rsErrors)}
        ${tile(count("details"), T.rsDetails)}
      </div>
      <button type="button" class="flow-primary" id="study-copy">${window.icon("check", 16)} ${T.copyResults}</button>
      <details class="study-details"><summary>${T.rsFull}</summary><pre id="study-text"></pre></details>
      <button type="button" class="flow-link" id="study-close">${T.finishStudy}</button>
    </div></div>`;

    const dialog = root.querySelector('[role="dialog"]');
    const release = window.trapFocus(dialog, () => {});
    dialog.querySelector("#study-text").textContent = summary;
    dialog.querySelector("h2").focus();

    dialog.querySelector("#study-copy").onclick = async (e) => {
      const text = dialog.querySelector("#study-text").textContent;
      try { await navigator.clipboard.writeText(text); } catch {
        dialog.querySelector(".study-details").open = true;
        const range = document.createRange();
        range.selectNodeContents(dialog.querySelector("#study-text"));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        document.execCommand("copy");
      }
      const btn = e.currentTarget;
      btn.textContent = T.copied;
      btn.classList.add("done");
    };

    dialog.querySelector("#study-close").onclick = () => {
      release();
      root.innerHTML = "";
      location.href = enabled ? window.withParam("study", "1") : "index.html";
    };
    return true;
  }

  // Badge so the researcher can see the mode is on.
  if (enabled) {
    document.addEventListener("DOMContentLoaded", () => {
      const slot = document.querySelector("[data-study-slot]");
      if (slot) slot.innerHTML = `<span class="study-badge">${T.studyBadge}</span>`;
      // Neutral labels so participants can't tell which version is the baseline.
      const name = document.body.dataset.studyName;
      if (name) {
        document.title = T.studyPageTitle(name);
        const h1 = document.querySelector(".flow-chrome h1");
        const sub = document.querySelector(".flow-chrome p");
        if (h1) h1.textContent = T.studyPageTitle(name);
        if (sub) sub.textContent = T.studyPageSub;
      }
    });
  }

  window.Study = { enabled, start, screen, event, finish };
})();
