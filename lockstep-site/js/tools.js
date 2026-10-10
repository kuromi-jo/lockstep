// Accessibility toolbar: language (EN / FIL), larger text, and read-aloud (Web Speech API).
// Settings live in the URL (?lang=fil&text=lg) so nothing is stored in the browser.
(function () {
  const T = window.T;
  const params = new URLSearchParams(location.search);
  let large = params.get("text") === "lg";
  document.body.classList.toggle("text-lg", large);

  window.mountTools = function (slot, getReadable) {
    const canSpeak = "speechSynthesis" in window;
    slot.innerHTML = `
      <div class="tools" role="toolbar" aria-label="${T.language}, ${T.textSize}, ${T.readAloud}">
        <span class="tool-group" role="group" aria-label="${T.language}">
          <a class="tool ${T.lang === "en" ? "on" : ""}" href="${window.withParam("lang", null)}" ${T.lang === "en" ? 'aria-current="true"' : ""} lang="en">EN</a>
          <a class="tool ${T.lang === "fil" ? "on" : ""}" href="${window.withParam("lang", "fil")}" ${T.lang === "fil" ? 'aria-current="true"' : ""} lang="fil">FIL</a>
        </span>
        <button type="button" class="tool" id="tool-text" aria-pressed="${large}" aria-label="${T.textSize}">A<span class="tool-plus">+</span></button>
        ${canSpeak ? `<button type="button" class="tool" id="tool-read" aria-pressed="false">${window.icon("volume", 14)}<span>${T.readAloud}</span></button>` : ""}
      </div>`;

    slot.querySelector("#tool-text").onclick = (e) => {
      large = !large;
      document.body.classList.toggle("text-lg", large);
      e.currentTarget.setAttribute("aria-pressed", large);
      // Keep the choice when switching language.
      slot.querySelectorAll(".tool-group a").forEach((a) => {
        const url = new URL(a.href);
        large ? url.searchParams.set("text", "lg") : url.searchParams.delete("text");
        a.href = url.pathname + url.search;
      });
    };

    const readBtn = slot.querySelector("#tool-read");
    if (readBtn) {
      const label = readBtn.querySelector("span");
      const stop = () => { speechSynthesis.cancel(); readBtn.setAttribute("aria-pressed", "false"); label.textContent = T.readAloud; };
      readBtn.onclick = () => {
        if (speechSynthesis.speaking) return stop();
        const text = getReadable();
        if (!text) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = T.speechLang;
        u.rate = 0.92;
        const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(T.lang === "fil" ? "fil" : "en"));
        if (voice) u.voice = voice;
        u.onend = stop;
        u.onerror = stop;
        readBtn.setAttribute("aria-pressed", "true");
        label.textContent = T.stopReading;
        speechSynthesis.speak(u);
      };
      window.stopReading = () => speechSynthesis.speaking && stop();
    }
  };

  // Idle wipe: after 3 minutes without input the page reloads, clearing everything in
  // memory (protects shared test devices). A warning appears 30 seconds before.
  window.startIdleWipe = function (limit = 180, warn = 150) {
    let idle = 0;
    let banner = null;
    const reset = () => {
      idle = 0;
      if (banner) { banner.remove(); banner = null; }
    };
    ["pointerdown", "keydown", "input", "touchstart", "wheel"].forEach((e) => document.addEventListener(e, reset, { passive: true, capture: true }));
    setInterval(() => {
      if (window.idlePaused) { idle = 0; return; } // e.g. waiting for an emailed code
      idle++;
      if (idle === warn && !banner) {
        banner = document.createElement("div");
        banner.className = "idle-banner";
        banner.setAttribute("role", "alert");
        banner.innerHTML = `<span>${T.idleWarn}</span><button type="button">${T.imHere}</button>`;
        banner.querySelector("button").onclick = reset;
        document.body.appendChild(banner);
      }
      if (idle >= limit) location.reload();
    }, 1000);
  };

  // Plain text of the visible screen, skipping icons and hidden helpers.
  window.readableText = function (root) {
    const parts = [];
    root.querySelectorAll("h2, .flow-eyebrow, .flow-text, .flow-detail, .flow-state, .flow-error, .flow-risk-head, .flow-review-row, .flow-settings-list button, .flow-options button, .reminder, .flow-primary, label")
      .forEach((el) => { if (el.offsetParent !== null) parts.push(el.innerText.replace(/\s+/g, " ").trim()); });
    return [...new Set(parts)].join(". ");
  };
})();
