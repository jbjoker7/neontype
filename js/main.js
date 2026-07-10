// neontype ui wiring: quick bar, settings drawer, test lifecycle, results

const PRESETS = [
  { name: "apprentice", target: 15, desc: "common, comfortable words" },
  { name: "samurai", target: 40, desc: "everyday words with some bite" },
  { name: "ronin", target: 65, desc: "long reaches and rarer words" },
  { name: "kami", target: 85, desc: "the awkward and the obscure" },
];
const MODE_VALUES = { time: [15, 30, 60, 120], words: [10, 25, 50, 100], infinite: [] };
const VALUE_LABEL = { time: "seconds", words: "words", infinite: "" };
const LINE_OPTIONS = [2, 3, 4, 5];
const HINTS = {
  time: "<kbd>tab</kbd> or <kbd>esc</kbd> — restart · <kbd>⚙</kbd> — settings",
  words: "<kbd>tab</kbd> or <kbd>esc</kbd> — restart · <kbd>⚙</kbd> — settings",
  infinite:
    "<kbd>shift</kbd>+<kbd>enter</kbd> — finish · <kbd>tab</kbd> or <kbd>esc</kbd> — restart",
};

const state = {
  mode: "time",
  value: 30,
  target: 40,
  library: "english",
  lines: 3,
  sound: false,
  capsWarn: true,
  ...JSON.parse(localStorage.getItem("neontype.config") || "{}"),
};
if (!LIBRARIES[state.library]) state.library = "english";
if (!MODE_VALUES[state.mode]) state.mode = "time";
if (!LINE_OPTIONS.includes(state.lines)) state.lines = 3;

let test = null;
let chart = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function saveConfig() {
  const { mode, value, target, library, lines, sound, capsWarn } = state;
  localStorage.setItem(
    "neontype.config",
    JSON.stringify({ mode, value, target, library, lines, sound, capsWarn })
  );
}

function presetFor(target) {
  return PRESETS.find((p) => p.target === target) || null;
}

// --- shared controls (quick bar + drawer stay in sync) -----------------------

function applyAndRestart(changes) {
  Object.assign(state, changes);
  if (!MODE_VALUES[state.mode].includes(state.value)) {
    state.value = MODE_VALUES[state.mode][1];
  }
  Sound.enabled = state.sound;
  saveConfig();
  syncControls();
  newTest();
}

function segButtons(container, items, isOn, onPick) {
  container.innerHTML = "";
  for (const item of items) {
    const b = document.createElement("button");
    b.textContent = item.label;
    b.classList.toggle("on", isOn(item));
    b.addEventListener("click", () => onPick(item));
    if (item.title) b.title = item.title;
    container.appendChild(b);
  }
}

function syncControls() {
  // mode segments (both copies)
  for (const id of ["#mode-group", "#s-mode"]) {
    $$(`${id} button`).forEach((b) =>
      b.classList.toggle("on", b.dataset.mode === state.mode)
    );
  }

  // value segments (both copies); infinite mode has no length to pick
  const noValues = MODE_VALUES[state.mode].length === 0;
  $("#value-qgroup").hidden = noValues;
  $("#s-value-field").hidden = noValues;
  const values = MODE_VALUES[state.mode].map((v) => ({ label: String(v), v }));
  for (const id of ["#value-group", "#s-value"]) {
    segButtons(
      $(id),
      values,
      (i) => i.v === state.value,
      (i) => applyAndRestart({ value: i.v })
    );
  }
  $("#value-label").textContent = VALUE_LABEL[state.mode];
  $("#s-value-label").textContent =
    state.mode === "time" ? "duration" : "length";

  // viewport lines
  segButtons(
    $("#s-lines"),
    LINE_OPTIONS.map((n) => ({ label: String(n), n })),
    (i) => i.n === state.lines,
    (i) => applyAndRestart({ lines: i.n })
  );
  document.documentElement.style.setProperty("--lines", state.lines);

  // contextual shortcut hint
  $("#hint").innerHTML = HINTS[state.mode];

  // difficulty chip
  const p = presetFor(state.target);
  $("#chip-name").textContent = p ? p.name : "custom";
  $("#chip-num").textContent = state.target;

  // presets
  segButtons(
    $("#s-presets"),
    PRESETS.map((p) => ({ label: p.name, ...p, title: p.desc })),
    (i) => i.target === state.target,
    (i) => applyAndRestart({ target: i.target })
  );

  // slider + live description
  $("#s-difficulty").value = state.target;
  $("#s-difficulty-out").textContent = state.target;
  const lib = LIBRARIES[state.library];
  $("#s-difficulty-help").textContent =
    `target ${state.target} — every test averages to words harder than ~${state.target}% of the ${lib.label} library`;

  // library cards
  const cards = $("#s-library");
  cards.innerHTML = "";
  for (const [id, l] of Object.entries(LIBRARIES)) {
    const b = document.createElement("button");
    b.className = "card" + (id === state.library ? " on" : "");
    b.innerHTML =
      `<strong>${l.label}</strong><em>${l.desc}</em><small>${l.words.length} words</small>`;
    b.addEventListener("click", () => applyAndRestart({ library: id }));
    cards.appendChild(b);
  }

  // toggles
  setToggle($("#s-sound"), state.sound);
  setToggle($("#s-caps"), state.capsWarn);
}

function setToggle(el, on) {
  el.classList.toggle("on", on);
  el.setAttribute("aria-checked", String(on));
}

function bindControls() {
  for (const id of ["#mode-group", "#s-mode"]) {
    $$(`${id} button`).forEach((b) =>
      b.addEventListener("click", () => applyAndRestart({ mode: b.dataset.mode }))
    );
  }

  const slider = $("#s-difficulty");
  slider.addEventListener("input", () => {
    state.target = Number(slider.value);
    $("#s-difficulty-out").textContent = state.target;
    $("#chip-num").textContent = state.target;
  });
  slider.addEventListener("change", () => applyAndRestart({ target: state.target }));

  $("#s-sound").addEventListener("click", () => {
    applyAndRestart({ sound: !state.sound });
    if (state.sound) Sound.click(); // audible preview as immediate feedback
  });
  $("#s-caps").addEventListener("click", () =>
    applyAndRestart({ capsWarn: !state.capsWarn })
  );

  // drawer open/close
  $("#settings-open").addEventListener("click", openDrawer);
  $("#difficulty-chip").addEventListener("click", openDrawer);
  $("#settings-close").addEventListener("click", closeDrawer);
  $("#drawer-scrim").addEventListener("click", closeDrawer);
}

function drawerOpen() {
  return !$("#settings").hidden;
}
function openDrawer() {
  $("#settings").hidden = false;
  $("#drawer-scrim").hidden = false;
  document.body.classList.add("drawer-open");
}
function closeDrawer() {
  $("#settings").hidden = true;
  $("#drawer-scrim").hidden = true;
  document.body.classList.remove("drawer-open");
}

// --- test lifecycle -----------------------------------------------------------

function newTest() {
  test?.destroy();
  $("#result").hidden = true;
  const testEl = $("#test");
  testEl.hidden = false;
  testEl.classList.remove("enter");
  void testEl.offsetWidth; // restart the entrance animation
  testEl.classList.add("enter");
  $("#live-wpm").textContent = "";
  $("#caps-warning").hidden = true;

  test = new TypingTest(
    {
      mode: state.mode,
      value: state.value,
      target: state.target,
      library: state.library,
      lines: state.lines,
      onTick: (t) => {
        if (t.elapsed > 2) {
          $("#live-wpm").textContent = `${Math.round(t.wpm())} wpm`;
        }
      },
      onFinish: showResult,
      onHit: (correct) => (correct ? Sound.click() : Sound.error()),
      onCapsLock: (on) =>
        ($("#caps-warning").hidden = !(on && state.capsWarn)),
    },
    {
      words: $("#words"),
      caret: $("#caret"),
      timer: $("#timer"),
    }
  );
}

function pbKey() {
  const len = state.mode === "infinite" ? "endless" : state.value;
  return `neontype.pb.${state.mode}.${len}.${state.target}.${state.library}`;
}

// count a number up from 0 with an ease-out curve
function countUp(el, target, format = (v) => Math.round(v), ms = 700) {
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = format(target * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function showResult(t) {
  $("#test").hidden = true;
  const resultEl = $("#result");
  resultEl.hidden = false;
  resultEl.classList.remove("enter");
  void resultEl.offsetWidth;
  resultEl.classList.add("enter");

  const wpm = t.wpm();
  countUp($("#r-wpm"), wpm);
  countUp($("#r-acc"), t.accuracy(), (v) => `${Math.round(v)}%`);

  const setStat = (id, v) => ($(id).textContent = v);
  setStat("#r-raw", Math.round(t.rawWpm()));
  setStat("#r-consistency", `${Math.round(t.consistency())}%`);
  setStat(
    "#r-chars",
    `${t.hits.correct}/${t.hits.incorrect}/${t.hits.extra}/${t.hits.missed}`
  );
  setStat("#r-time", `${Math.round(t.elapsed)}s`);
  const modeLabel =
    state.mode === "infinite" ? "infinite" : `${state.mode} ${state.value}`;
  setStat("#r-mode", `${modeLabel} · ${LIBRARIES[state.library].label}`);

  const avg = t.testAverage();
  setStat("#r-difficulty", `${avg.toFixed(1)} avg`);
  $("#r-difficulty-note").textContent = `target ${state.target}`;

  const prev = Number(localStorage.getItem(pbKey()) || 0);
  const isPb = wpm > prev && t.samples.length > 1;
  if (isPb) localStorage.setItem(pbKey(), String(wpm));
  $("#r-pb").hidden = !isPb;

  chart.setData(t.samples);
  fillChartTable($("#chart-table tbody"), t.samples);
  $("#next-test").focus();
}

// --- global keys & focus ---------------------------------------------------------

function bindKeys() {
  document.addEventListener("keydown", (e) => {
    if (drawerOpen()) {
      if (e.key === "Escape") closeDrawer();
      return;
    }
    if (e.key === "Tab" || e.key === "Escape") {
      e.preventDefault();
      newTest();
      return;
    }
    if (!$("#result").hidden) {
      if (e.key === "Enter") newTest();
      return;
    }
    // infinite mode is ended by the typist
    if (
      e.key === "Enter" &&
      e.shiftKey &&
      state.mode === "infinite" &&
      test?.started &&
      !test.finished
    ) {
      e.preventDefault();
      test.finish();
      return;
    }
    if (test?.handleKey(e)) e.preventDefault();
  });

  // dim + blur the words when the window loses focus
  const overlay = $("#focus-overlay");
  window.addEventListener("blur", () => {
    if ($("#test").hidden) return;
    overlay.hidden = false;
    $("#words").classList.add("blurred");
  });
  const refocus = () => {
    overlay.hidden = true;
    $("#words").classList.remove("blurred");
    // position may be stale after a long background-tab suspension
    test?.positionCaret(true);
  };
  window.addEventListener("focus", refocus);
  overlay.addEventListener("click", refocus);
}

document.addEventListener("DOMContentLoaded", () => {
  Sound.enabled = state.sound;
  chart = new ResultChart($("#chart"), $("#chart-tooltip"));
  bindControls();
  bindKeys();
  syncControls();
  $("#next-test").addEventListener("click", newTest);
  newTest();
});
