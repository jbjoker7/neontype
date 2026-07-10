// neontype ui wiring: config bar, test lifecycle, results, persistence

const PRESETS = [
  { name: "apprentice", target: 15 },
  { name: "samurai", target: 40 },
  { name: "ronin", target: 65 },
  { name: "kami", target: 85 },
];
const MODE_VALUES = { time: [15, 30, 60, 120], words: [10, 25, 50, 100] };

const state = {
  mode: "time",
  value: 30,
  target: 40,
  ...JSON.parse(localStorage.getItem("neontype.config") || "{}"),
};

let test = null;
let chart = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function saveConfig() {
  localStorage.setItem(
    "neontype.config",
    JSON.stringify({ mode: state.mode, value: state.value, target: state.target })
  );
}

// --- config bar -------------------------------------------------------------

function renderConfig() {
  $$("#mode-group button").forEach((b) =>
    b.classList.toggle("on", b.dataset.mode === state.mode)
  );
  const valueGroup = $("#value-group");
  valueGroup.innerHTML = "";
  for (const v of MODE_VALUES[state.mode]) {
    const b = document.createElement("button");
    b.textContent = v;
    b.classList.toggle("on", v === state.value);
    b.addEventListener("click", () => {
      state.value = v;
      saveConfig();
      renderConfig();
      newTest();
    });
    valueGroup.appendChild(b);
  }
  $$("#preset-group button").forEach((b) =>
    b.classList.toggle("on", Number(b.dataset.target) === state.target)
  );
  $("#difficulty-slider").value = state.target;
  $("#difficulty-value").textContent = state.target;
}

function bindConfig() {
  $$("#mode-group button").forEach((b) =>
    b.addEventListener("click", () => {
      state.mode = b.dataset.mode;
      if (!MODE_VALUES[state.mode].includes(state.value)) {
        state.value = MODE_VALUES[state.mode][1];
      }
      saveConfig();
      renderConfig();
      newTest();
    })
  );
  const preset = $("#preset-group");
  PRESETS.forEach((p) => {
    const b = document.createElement("button");
    b.textContent = p.name;
    b.dataset.target = p.target;
    b.title = `target difficulty ${p.target}`;
    b.addEventListener("click", () => {
      state.target = p.target;
      saveConfig();
      renderConfig();
      newTest();
    });
    preset.appendChild(b);
  });
  const slider = $("#difficulty-slider");
  slider.addEventListener("input", () => {
    state.target = Number(slider.value);
    $("#difficulty-value").textContent = state.target;
  });
  slider.addEventListener("change", () => {
    saveConfig();
    renderConfig();
    newTest();
  });
}

// --- test lifecycle -----------------------------------------------------------

function newTest() {
  test?.destroy();
  $("#result").hidden = true;
  $("#test").hidden = false;
  $("#live-wpm").textContent = "";
  test = new TypingTest(
    {
      mode: state.mode,
      value: state.value,
      target: state.target,
      onTick: (t) => {
        if (t.elapsed > 2) {
          $("#live-wpm").textContent = `${Math.round(t.wpm())} wpm`;
        }
      },
      onFinish: showResult,
    },
    {
      words: $("#words"),
      caret: $("#caret"),
      timer: $("#timer"),
    }
  );
}

function pbKey() {
  return `neontype.pb.${state.mode}.${state.value}.${state.target}`;
}

function showResult(t) {
  $("#test").hidden = true;
  $("#result").hidden = false;

  const wpm = t.wpm();
  const setStat = (id, v) => ($(id).textContent = v);
  setStat("#r-wpm", Math.round(wpm));
  setStat("#r-acc", `${Math.round(t.accuracy())}%`);
  setStat("#r-raw", Math.round(t.rawWpm()));
  setStat("#r-consistency", `${Math.round(t.consistency())}%`);
  setStat(
    "#r-chars",
    `${t.hits.correct}/${t.hits.incorrect}/${t.hits.extra}/${t.hits.missed}`
  );
  setStat("#r-time", `${Math.round(t.elapsed)}s`);
  setStat("#r-mode", `${state.mode} ${state.value}`);

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

// --- global keys ---------------------------------------------------------------

function bindKeys() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab" || e.key === "Escape") {
      e.preventDefault();
      newTest();
      return;
    }
    if (!$("#result").hidden) {
      if (e.key === "Enter") newTest();
      return;
    }
    if (test?.handleKey(e)) e.preventDefault();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  chart = new ResultChart($("#chart"), $("#chart-tooltip"));
  bindConfig();
  bindKeys();
  renderConfig();
  $("#next-test").addEventListener("click", newTest);
  newTest();
});
