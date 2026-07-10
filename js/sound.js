// neontype typing sounds: tiny synthesized clicks, no audio assets
//
// The context is created lazily on the first play call (browsers require a
// user gesture before audio can start, and a keypress is one).

const Sound = {
  enabled: false,
  ctx: null,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return true;
  },

  blip({ freq, type, gain, decay }) {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + decay);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  },

  // correct keystroke: a short high tick with a little pitch variance so
  // fast typing doesn't sound like a machine gun on one note
  click() {
    this.blip({
      freq: 1600 + Math.random() * 500,
      type: "triangle",
      gain: 0.045,
      decay: 0.045,
    });
  },

  // mistake: lower, duller thud
  error() {
    this.blip({ freq: 140, type: "square", gain: 0.05, decay: 0.09 });
  },
};
