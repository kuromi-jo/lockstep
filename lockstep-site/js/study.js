// Study mode (?study=1): records anonymous, in-memory task metrics for the usability test,
// then shows a copyable results summary for the Google Form.
// Nothing is sent anywhere or saved in the browser; the researcher copies the results.
(function () {
  const T = window.T;
  const enabled = new URLSearchParams(location.search).get("study") === "1";

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
    if (!enabled) return;
    data.flow = flow;
    data.startedAt = now();
  }

  function screen(name) {
    if (!enabled) return;
    const t = now();
    if (data.current) data.screenTimes[data.current] = (data.screenTimes[data.current] || 0) + (t - data.currentSince);
    data.current = name;
    data.currentSince = t;
  }

  function event(type, detail = "") {
    if (!enabled) return;
    data.events.push({ t: Math.round((now() - data.startedAt) / 1000), type, detail });
  }

  const count = (type) => data.events.filter((e) => e.type === type).length;
  const secs = (ms) => `${Math.round(ms / 1000)}s`;

  function finish(outcome) {
    if (!enabled) return false;
    screen("end");
    const totalMs = now() - data.startedAt;
    const root = document.getElementById("modal-root");
    const perScreen = Object.entries(data.screenTimes).filter(([k]) => k !== "end").map(([k, v]) => `${k}=${secs(v)}`).join(", ");
    const summary = [
      `Flow: ${data.flow}  ·  Language: ${T.lang}`,
      `Total time: ${secs(totalMs)}`,
      `Final protection: ${outcome.summary}`,
      `Checks covered: ${outcome.checks ?? "n/a"} / 6`,
      `Skips: ${count("skip")}  ·  Errors: ${count("error")}  ·  "More details" opened: ${count("details")}  ·  Fix-now used: ${count("fix")}  ·  Back presses: ${count("back")}`,
      `Time per screen: ${perScreen}`,
      `Event log: ${data.events.map((e) => `[${e.t}s] ${e.type}${e.detail ? `:${e.detail}` : ""}`).join(" ")}`,
      "",
      "Spreadsheet row (tab-separated):",
      [data.flow, T.lang, Math.round(totalMs / 1000), outcome.checks ?? "", count("skip"), count("error"), count("details"), count("fix")].join("\t"),
      "Columns: flow, lang, total_s, checks, skips, errors, details, fixes",
    ].join("\n");

    // Results only — the questionnaire itself lives in the Google Form.
    root.innerHTML = `<div class="flow-modal-backdrop"><div class="flow-modal study-modal" role="dialog" aria-modal="true" aria-labelledby="study-title">
      <p class="study-badge">${T.studyBadge}</p>
      <h2 id="study-title" tabindex="-1">${T.studyDoneTitle}</h2>
      <p>${T.studyDoneText}</p>
      <button type="button" class="flow-primary" id="study-copy">${T.copyResults}</button>
      <details class="study-details"><summary>${T.resultsTitle}</summary><pre id="study-text"></pre></details>
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
      e.target.textContent = T.copied;
    };

    dialog.querySelector("#study-close").onclick = () => {
      release();
      root.innerHTML = "";
      location.href = window.withParam("study", "1");
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
