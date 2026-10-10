// Study mode (?study=1): records anonymous, in-memory task metrics for the usability test,
// then shows a SUS questionnaire + comprehension check and a copyable results summary.
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

  function susScore(answers) {
    // Standard SUS scoring: odd items (score - 1), even items (5 - score), sum × 2.5.
    if (answers.some((a) => !a)) return null;
    const sum = answers.reduce((acc, a, i) => acc + (i % 2 === 0 ? a - 1 : 5 - a), 0);
    return sum * 2.5;
  }

  function finish(outcome) {
    if (!enabled) return false;
    screen("end");
    const totalMs = now() - data.startedAt;
    const root = document.getElementById("modal-root");
    const sus = T.sus.map((q, i) => `<fieldset class="sus-item"><legend>${i + 1}. ${q}</legend><div>${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="sus${i}" value="${v}" /><span>${v}</span></label>`).join("")}</div></fieldset>`).join("");
    const comp = T.comp.map((c, i) => `<fieldset class="comp-item"><legend>${c.q}</legend>${c.a.map((a, j) => `<label><input type="radio" name="comp${i}" value="${j}" /> <span>${a}</span></label>`).join("")}</fieldset>`).join("");

    root.innerHTML = `<div class="flow-modal-backdrop"><div class="flow-modal study-modal" role="dialog" aria-modal="true" aria-labelledby="study-title">
      <p class="study-badge">${T.studyBadge}</p>
      <h2 id="study-title" tabindex="-1">${T.studyTitle}</h2>
      <p>${T.studyIntro}</p>
      <label class="flow-field">${T.participantCode}<input id="study-code" maxlength="8" autocomplete="off" placeholder="P01" /></label>
      <h3 class="study-h">${T.susTitle}</h3>
      ${sus}
      <h3 class="study-h">${T.compTitle}</h3>
      ${comp}
      <button type="button" class="flow-primary" id="study-show">${T.showResults}</button>
      <div id="study-results" hidden>
        <h3 class="study-h">${T.resultsTitle}</h3>
        <pre id="study-text"></pre>
        <button type="button" class="flow-primary" id="study-copy">${T.copyResults}</button>
        <button type="button" class="flow-link" id="study-close">${T.finishStudy}</button>
      </div>
    </div></div>`;

    const dialog = root.querySelector('[role="dialog"]');
    const release = window.trapFocus(dialog, () => {});
    dialog.querySelector("h2").focus();

    dialog.querySelector("#study-show").onclick = () => {
      const val = (name) => Number(dialog.querySelector(`input[name="${name}"]:checked`)?.value || 0);
      const susAnswers = T.sus.map((_, i) => val(`sus${i}`));
      const compAnswers = T.comp.map((_, i) => dialog.querySelector(`input[name="comp${i}"]:checked`)?.value);
      const compCorrect = compAnswers.filter((a, i) => a !== undefined && Number(a) === T.comp[i].correct).length;
      const score = susScore(susAnswers);
      const code = (dialog.querySelector("#study-code").value || "P??").replace(/[^\w-]/g, "").slice(0, 8);
      const perScreen = Object.entries(data.screenTimes).filter(([k]) => k !== "end").map(([k, v]) => `${k}=${secs(v)}`).join(", ");

      const summary = [
        `Participant: ${code}`,
        `Flow: ${data.flow}  ·  Language: ${T.lang}`,
        `Total time: ${secs(totalMs)}`,
        `Final protection: ${outcome.summary}`,
        `Checks covered: ${outcome.checks ?? "n/a"} / 6`,
        `Skips: ${count("skip")}  ·  Errors: ${count("error")}  ·  "More details" opened: ${count("details")}  ·  Fix-now used: ${count("fix")}  ·  Back presses: ${count("back")}`,
        `Time per screen: ${perScreen}`,
        `SUS score: ${score ?? "incomplete"}  (raw: ${susAnswers.join(",")})`,
        `Comprehension: ${compCorrect} / ${T.comp.length} correct`,
        `Event log: ${data.events.map((e) => `[${e.t}s] ${e.type}${e.detail ? `:${e.detail}` : ""}`).join(" ")}`,
        "",
        "Spreadsheet row (tab-separated):",
        [code, data.flow, T.lang, Math.round(totalMs / 1000), outcome.checks ?? "", count("skip"), count("error"), count("details"), count("fix"), score ?? "", compCorrect].join("\t"),
        "Columns: participant, flow, lang, total_s, checks, skips, errors, details, fixes, sus, comprehension",
      ].join("\n");

      dialog.querySelector("#study-text").textContent = summary;
      dialog.querySelector("#study-results").hidden = false;
      dialog.querySelector("#study-copy").focus();
    };

    dialog.querySelector("#study-copy").onclick = async (e) => {
      const text = dialog.querySelector("#study-text").textContent;
      try { await navigator.clipboard.writeText(text); } catch {
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
