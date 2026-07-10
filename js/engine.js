// neontype test engine: input handling, timing, scoring, per-second sampling

const MAX_EXTRA = 8; // extra letters allowed past the end of a word

class TypingTest {
  // opts: { mode: "time"|"words", value: seconds|wordCount, target: 0-100,
  //         library: string, onTick(test), onFinish(test),
  //         onHit(correct: boolean), onCapsLock(on: boolean) }
  // els:  { words, caret, timer }
  // The caret element lives INSIDE the #words container so the scroll
  // transform moves caret and text as one unit — measuring offsets against
  // a transformed ancestor is what made the old caret jump around.
  constructor(opts, els) {
    this.opts = opts;
    this.els = els;

    // words mode is the only fixed-length mode; time and infinite modes
    // stream words endlessly (topped up in commitWord, never exhausted)
    const initialCount =
      opts.mode === "words"
        ? opts.value
        : opts.mode === "time"
          ? Math.max(60, opts.value * 4)
          : 80;
    const gen = generateTest(initialCount, opts.target, opts.library);
    this.feeder = gen.feeder;
    this.words = gen.words.map((w) => ({
      target: w.text,
      difficulty: w.difficulty,
      typed: "",
      committed: false,
      correct: null,
    }));
    this.wordEls = [];

    this.wordIndex = 0;
    this.started = false;
    this.finished = false;
    this.startTime = 0;
    this.elapsed = 0;

    // keystroke accounting: correct / incorrect / extra / missed
    this.hits = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
    this.correctChars = 0; // committed correct chars incl. spaces, for WPM
    this.rawChars = 0; // all committed chars incl. spaces

    // per-second samples for the chart: { sec, wpm, raw, errors }
    this.samples = [];
    this.secErrors = 0;
    this.secRaw = 0;
    this.lastSample = 0;

    // caret animation state: an exponential-smoothing rAF loop chases
    // caretTarget. CSS transitions are not used — retargeting a transition
    // every keystroke rubber-bands, and a JS loop can snap when needed.
    this.caretPos = { x: 0, y: 0 };
    this.caretTarget = { x: 0, y: 0 };
    this.caretRaf = 0;
    this.caretLastT = 0;
    this.destroyed = false;
    // live query — reduced-motion can be toggled mid-test
    this.motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    this.onResize = () => this.positionCaret(true);
    window.addEventListener("resize", this.onResize);

    // late font-metric swaps change glyph widths; re-snap once fonts settle
    document.fonts?.ready?.then(() => this.positionCaret(true));

    this.render();
    this.updateTimer();
  }

  // --- input -------------------------------------------------------------

  handleKey(e) {
    if (this.finished) return false;

    if (this.opts.onCapsLock && e.getModifierState) {
      this.opts.onCapsLock(e.getModifierState("CapsLock"));
    }

    const word = this.words[this.wordIndex];

    if (e.key === "Backspace") {
      if (e.ctrlKey || e.altKey || e.metaKey) {
        if (word.typed) {
          word.typed = "";
          this.renderWord(this.wordIndex);
        } else this.stepBack();
      } else if (word.typed) {
        word.typed = word.typed.slice(0, -1);
        this.eraseLetter(word);
      } else {
        this.stepBack();
      }
      this.positionCaret();
      return true;
    }

    if (e.key === " ") {
      if (!word.typed) return true; // swallow leading spaces
      this.commitWord();
      return true;
    }

    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return false;

    if (!this.started) this.start();
    if (word.typed.length >= word.target.length + MAX_EXTRA) return true;

    const pos = word.typed.length;
    word.typed += e.key;
    this.secRaw++;
    let hit;
    if (pos < word.target.length) {
      hit = e.key === word.target[pos];
      if (hit) this.hits.correct++;
      else {
        this.hits.incorrect++;
        this.secErrors++;
      }
    } else {
      hit = false;
      this.hits.extra++;
      this.secErrors++;
    }
    this.opts.onHit?.(hit);

    this.paintLetter(word);
    this.positionCaret();

    // words mode ends on the last letter of the last word
    if (
      this.opts.mode === "words" &&
      this.wordIndex === this.words.length - 1 &&
      word.typed === word.target
    ) {
      this.commitWord();
    }
    return true;
  }

  // Surgically paint the letter that was just typed — rebuilding the whole
  // word's spans every keystroke causes needless layout churn.
  paintLetter(word) {
    const el = this.wordEls[this.wordIndex];
    const pos = word.typed.length - 1;
    if (pos < word.target.length) {
      el.children[pos].className =
        word.typed[pos] === word.target[pos] ? "ok" : "bad";
    } else {
      const s = document.createElement("span");
      s.textContent = word.typed[pos];
      s.className = "extra";
      el.appendChild(s);
    }
  }

  // Undo the paint for the letter just removed by backspace.
  eraseLetter(word) {
    const el = this.wordEls[this.wordIndex];
    const pos = word.typed.length; // index of the char that was removed
    if (pos >= word.target.length) {
      if (el.lastChild?.className === "extra") el.removeChild(el.lastChild);
    } else {
      el.children[pos].className = "";
    }
  }

  stepBack() {
    // allow backing into the previous word only if it was committed with errors
    if (this.wordIndex === 0) return;
    const prev = this.words[this.wordIndex - 1];
    if (prev.correct) return;
    prev.committed = false;
    this.uncommitChars(prev);
    this.wordIndex--;
    this.renderWord(this.wordIndex);
    this.renderWord(this.wordIndex + 1);
    this.positionCaret();
  }

  commitWord() {
    const word = this.words[this.wordIndex];
    const el = this.wordEls[this.wordIndex];
    word.committed = true;
    word.correct = word.typed === word.target;

    const missed = Math.max(0, word.target.length - word.typed.length);
    this.hits.missed += missed;

    // chars for wpm: typed chars + the space, counted as correct only if the word is perfect
    this.rawChars += word.typed.length + 1;
    if (word.correct) this.correctChars += word.target.length + 1;

    el.classList.remove("active");
    if (!word.correct) {
      el.classList.add("error");
      this.flashWord(this.wordIndex);
    }
    this.wordIndex++;
    this.wordEls[this.wordIndex]?.classList.add("active");

    if (this.opts.mode === "words" && this.wordIndex >= this.words.length) {
      this.finish();
      return;
    }
    if (
      this.opts.mode !== "words" &&
      this.wordIndex >= this.words.length - 30
    ) {
      this.appendWords(30);
    }
    this.positionCaret();
  }

  uncommitChars(word) {
    this.rawChars -= word.typed.length + 1;
    if (word.correct) this.correctChars -= word.target.length + 1;
    this.hits.missed -= Math.max(0, word.target.length - word.typed.length);
    word.correct = null;
  }

  // --- lifecycle ----------------------------------------------------------

  start() {
    this.started = true;
    this.startTime = performance.now();
    this.tickHandle = setInterval(() => this.tick(), 100);
  }

  tick() {
    this.elapsed = (performance.now() - this.startTime) / 1000;

    const sec = Math.floor(this.elapsed);
    if (sec > this.lastSample && sec >= 1) {
      this.lastSample = sec;
      this.samples.push({
        sec,
        wpm: this.wpm(),
        raw: (this.secRaw / 5) * 60, // this second's burst, extrapolated
        errors: this.secErrors,
      });
      this.secErrors = 0;
      this.secRaw = 0;
    }

    this.updateTimer();
    this.opts.onTick?.(this);

    // infinite mode never auto-finishes — the typist ends it with shift+enter
    if (this.opts.mode === "time" && this.elapsed >= this.opts.value) {
      this.finish();
    }
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    clearInterval(this.tickHandle);
    this.elapsed = this.started
      ? (performance.now() - this.startTime) / 1000
      : 0;

    // count the in-progress word's correct-so-far chars toward wpm
    const word = this.words[this.wordIndex];
    if (word && !word.committed && word.typed) {
      let ok = 0;
      for (let i = 0; i < word.typed.length && i < word.target.length; i++) {
        if (word.typed[i] === word.target[i]) ok++;
        else break;
      }
      if (ok === word.typed.length) this.correctChars += ok;
      this.rawChars += word.typed.length;
    }

    this.els.caret.classList.add("hidden");
    cancelAnimationFrame(this.caretRaf);
    this.caretRaf = 0;
    this.opts.onFinish?.(this);
  }

  destroy() {
    this.destroyed = true;
    clearInterval(this.tickHandle);
    clearTimeout(this.caretIdle);
    cancelAnimationFrame(this.caretRaf);
    this.caretRaf = 0;
    window.removeEventListener("resize", this.onResize);
  }

  // --- stats ---------------------------------------------------------------

  minutes() {
    return Math.max(this.elapsed, 1) / 60;
  }

  wpm() {
    return this.correctChars / 5 / this.minutes();
  }

  rawWpm() {
    return this.rawChars / 5 / this.minutes();
  }

  accuracy() {
    const total =
      this.hits.correct + this.hits.incorrect + this.hits.extra;
    return total ? (this.hits.correct / total) * 100 : 100;
  }

  consistency() {
    const raws = this.samples.map((s) => s.raw).filter((r) => r > 0);
    if (raws.length < 2) return 100;
    const mean = raws.reduce((a, b) => a + b, 0) / raws.length;
    const sd = Math.sqrt(
      raws.reduce((a, b) => a + (b - mean) ** 2, 0) / raws.length
    );
    return Math.max(0, (1 - sd / mean) * 100);
  }

  // mean difficulty of the words the typist actually saw
  testAverage() {
    const seen = this.words.slice(0, Math.max(this.wordIndex + 1, 1));
    return seen.reduce((a, w) => a + w.difficulty, 0) / seen.length;
  }

  // --- rendering -----------------------------------------------------------

  appendWords(n) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const w = this.feeder.next();
      this.words.push({
        target: w.text,
        difficulty: w.difficulty,
        typed: "",
        committed: false,
        correct: null,
      });
      const el = this.buildWordEl(this.words.length - 1);
      this.wordEls.push(el);
      frag.appendChild(el);
    }
    this.els.words.appendChild(frag);
  }

  buildWordEl(index) {
    const word = this.words[index];
    const el = document.createElement("div");
    el.className = "word";
    for (const ch of word.target) {
      const s = document.createElement("span");
      s.textContent = ch;
      el.appendChild(s);
    }
    return el;
  }

  render() {
    const container = this.els.words;
    container.innerHTML = "";
    // caret first, so clearing/rebuilding words never orphans it; keep it
    // hidden until the first snap so the previous test's position never
    // paints for a frame
    container.appendChild(this.els.caret);
    this.els.caret.classList.add("hidden");
    this.wordEls = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.words.length; i++) {
      const el = this.buildWordEl(i);
      this.wordEls.push(el);
      frag.appendChild(el);
    }
    container.appendChild(frag);
    container.style.setProperty("--scroll", "0px");
    this.renderWord(0);
    this.wordEls[0]?.classList.add("active");
    requestAnimationFrame(() => {
      this.positionCaret(true);
      if (!this.destroyed) this.els.caret.classList.remove("hidden");
    });
  }

  renderWord(index) {
    const word = this.words[index];
    const el = this.wordEls[index];
    if (!word || !el) return;

    el.className = "word";
    if (index === this.wordIndex && !this.finished) el.classList.add("active");
    if (word.committed && !word.correct) el.classList.add("error");

    // rebuild letter spans: target letters + extras
    el.innerHTML = "";
    const t = word.target;
    const typed = word.typed;
    for (let i = 0; i < t.length; i++) {
      const s = document.createElement("span");
      s.textContent = t[i];
      if (i < typed.length) s.className = typed[i] === t[i] ? "ok" : "bad";
      el.appendChild(s);
    }
    for (let i = t.length; i < typed.length; i++) {
      const s = document.createElement("span");
      s.textContent = typed[i];
      s.className = "extra";
      el.appendChild(s);
    }
  }

  // Measure the caret target in #words-local coordinates.
  //
  // getBoundingClientRect is used instead of offsetLeft/offsetTop for two
  // reasons: rects are fractional (offset* values are rounded integers, which
  // drifts in monospace text whose glyph width is not a whole pixel), and
  // subtracting the container's own rect cancels every ancestor transform —
  // the line-scroll translate and any entrance animation shift both rects
  // equally, so the difference is stable no matter when we measure.
  measureCaret() {
    const el = this.wordEls[this.wordIndex];
    if (!el) return null;
    const wordsRect = this.els.words.getBoundingClientRect();
    const wordRect = el.getBoundingClientRect();
    const typed = this.words[this.wordIndex].typed.length;
    const letters = el.children;
    let x;
    if (typed === 0 || letters.length === 0) {
      x = wordRect.left - wordsRect.left;
    } else {
      const ref = letters[Math.min(typed, letters.length) - 1];
      x = ref.getBoundingClientRect().right - wordsRect.left;
    }
    // y always from the word's line box, never the glyph box — a letter
    // span's rect top sits below the line top, and mixing the two would bob
    // the caret vertically as it crosses each word. (A word is an atomic
    // flex item, so its letters are always on the word's own line.)
    return { x, y: wordRect.top - wordsRect.top };
  }

  positionCaret(snap = false) {
    const el = this.wordEls[this.wordIndex];
    if (!el || this.finished || this.destroyed) return;

    const target = this.measureCaret();
    if (!target) return;
    this.caretTarget = target;

    if (snap || this.motionQuery?.matches) {
      this.caretPos = { ...target };
      this.applyCaret();
    } else if (!this.caretRaf) {
      this.caretLastT = performance.now();
      this.caretRaf = requestAnimationFrame((t) => this.animateCaret(t));
    }

    // solid while typing, blink when idle
    const caret = this.els.caret;
    caret.classList.add("typing");
    clearTimeout(this.caretIdle);
    this.caretIdle = setTimeout(() => caret.classList.remove("typing"), 600);

    this.scrollToCurrent(el);
  }

  animateCaret(now) {
    // clamp both ends: rAF timestamps are vsync times and can PRECEDE the
    // performance.now() that scheduled the loop (negative dt would flip k
    // negative and flick the caret backward); long gaps cap at 50ms
    const dt = Math.max(0, Math.min(50, now - this.caretLastT));
    this.caretLastT = now;
    // exponential smoothing: ~63% of remaining distance every 30ms
    const k = 1 - Math.exp(-dt / 30);
    const dx = this.caretTarget.x - this.caretPos.x;
    const dy = this.caretTarget.y - this.caretPos.y;
    if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) {
      this.caretPos = { ...this.caretTarget };
      this.applyCaret();
      this.caretRaf = 0;
      return; // settled — stop the loop until the next keystroke
    }
    this.caretPos.x += dx * k;
    this.caretPos.y += dy * k;
    this.applyCaret();
    this.caretRaf = requestAnimationFrame((t) => this.animateCaret(t));
  }

  applyCaret() {
    this.els.caret.style.transform = `translate3d(${this.caretPos.x}px, ${this.caretPos.y}px, 0)`;
  }

  scrollToCurrent(el) {
    const lineH = el.offsetHeight;
    // keep the active word on the second visible line, unless the viewport
    // is only two lines tall — then pin it to the first
    const keepLine = (this.opts.lines || 3) >= 3 ? 1 : 0;
    const offset = Math.max(0, el.offsetTop - keepLine * lineH);
    this.els.words.style.setProperty("--scroll", `${-offset}px`);
  }

  flashWord(index) {
    const el = this.wordEls[index];
    if (!el) return;
    el.classList.add("shake");
    el.addEventListener("animationend", () => el.classList.remove("shake"), {
      once: true,
    });
  }

  updateTimer() {
    if (this.opts.mode === "time") {
      const left = Math.max(0, this.opts.value - this.elapsed);
      this.els.timer.textContent = Math.ceil(left);
    } else if (this.opts.mode === "infinite") {
      this.els.timer.textContent = `${Math.floor(this.elapsed)}s · ${this.wordIndex}`;
    } else {
      this.els.timer.textContent = `${Math.min(
        this.wordIndex,
        this.words.length
      )}/${this.words.length}`;
    }
  }
}
