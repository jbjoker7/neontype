// neontype results chart: wpm over time, canvas-based
//
// One y-axis (wpm). Two series — average wpm and per-second raw burst —
// plus error seconds marked with an × at that second's raw value (status
// color, never a second axis). Colors validated for CVD separation and
// contrast against the dark surface.

const CHART_COLORS = {
  wpm: "#a855f7",
  raw: "#0891b2",
  error: "#ff3b6b",
  grid: "rgba(168, 133, 247, 0.10)",
  axis: "rgba(200, 180, 235, 0.55)",
};

class ResultChart {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.samples = [];
    canvas.addEventListener("mousemove", (e) => this.onHover(e));
    canvas.addEventListener("mouseleave", () => this.hideTooltip());
    window.addEventListener("resize", () => this.draw());
  }

  setData(samples) {
    this.samples = samples;
    this.draw();
  }

  layout() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = { l: 44, r: 14, t: 12, b: 26 };
    const w = rect.width - pad.l - pad.r;
    const h = rect.height - pad.t - pad.b;
    const maxY =
      Math.ceil(
        Math.max(10, ...this.samples.map((s) => Math.max(s.wpm, s.raw))) / 20
      ) * 20;
    const maxX = Math.max(2, this.samples.length ? this.samples.at(-1).sec : 2);

    this.x = (sec) => pad.l + ((sec - 1) / Math.max(1, maxX - 1)) * w;
    this.y = (v) => pad.t + h - (v / maxY) * h;
    return { ctx, rect, pad, w, h, maxY, maxX };
  }

  draw() {
    if (!this.samples.length || !this.canvas.isConnected) return;
    const { ctx, rect, pad, h, maxY, maxX } = this.layout();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.font = "11px ui-monospace, monospace";

    // recessive grid + y labels
    const steps = Math.min(5, maxY / 20 + 1);
    for (let i = 0; i < steps; i++) {
      const v = (maxY / (steps - 1)) * i;
      const y = this.y(v);
      ctx.strokeStyle = CHART_COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(rect.width - pad.r, y);
      ctx.stroke();
      ctx.fillStyle = CHART_COLORS.axis;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(v)), pad.l - 8, y);
    }

    // x labels (~6 ticks)
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const tickEvery = Math.max(1, Math.ceil(maxX / 6));
    for (let s = 1; s <= maxX; s += tickEvery) {
      ctx.fillText(`${s}s`, this.x(s), pad.t + h + 8);
    }

    this.drawLine("raw", CHART_COLORS.raw);
    this.drawLine("wpm", CHART_COLORS.wpm);

    // error markers: × at that second's raw value
    ctx.strokeStyle = CHART_COLORS.error;
    ctx.lineWidth = 2;
    for (const s of this.samples) {
      if (!s.errors) continue;
      const x = this.x(s.sec);
      const y = this.y(s.raw);
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4);
      ctx.lineTo(x - 4, y + 4);
      ctx.stroke();
    }

    // direct labels at line ends (identity is never color-alone)
    const last = this.samples.at(-1);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = CHART_COLORS.axis;
    const lx = Math.min(this.x(last.sec) + 6, rect.width - pad.r - 2);
    ctx.fillText("wpm", lx, this.y(last.wpm));
    if (Math.abs(this.y(last.raw) - this.y(last.wpm)) > 12) {
      ctx.fillText("raw", lx, this.y(last.raw));
    }
  }

  drawLine(key, color) {
    const { ctx } = { ctx: this.canvas.getContext("2d") };
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    this.samples.forEach((s, i) => {
      const x = this.x(s.sec);
      const y = this.y(s[key]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  onHover(e) {
    if (!this.samples.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best = this.samples[0];
    for (const s of this.samples) {
      if (Math.abs(this.x(s.sec) - mx) < Math.abs(this.x(best.sec) - mx)) best = s;
    }
    this.tooltip.innerHTML =
      `<strong>${best.sec}s</strong>` +
      `<span class="tt-wpm">wpm ${Math.round(best.wpm)}</span>` +
      `<span class="tt-raw">raw ${Math.round(best.raw)}</span>` +
      (best.errors ? `<span class="tt-err">× ${best.errors}</span>` : "");
    this.tooltip.style.opacity = 1;
    const tx = Math.min(this.x(best.sec) + 12, rect.width - 130);
    this.tooltip.style.transform = `translate(${tx}px, ${
      this.y(best.wpm) - 14
    }px)`;
  }

  hideTooltip() {
    this.tooltip.style.opacity = 0;
  }
}

// Accessible fallback: fill the <table> under the chart with the same data.
function fillChartTable(tbody, samples) {
  tbody.innerHTML = samples
    .map(
      (s) =>
        `<tr><td>${s.sec}</td><td>${Math.round(s.wpm)}</td><td>${Math.round(
          s.raw
        )}</td><td>${s.errors}</td></tr>`
    )
    .join("");
}
