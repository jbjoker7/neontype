// neontype test engine: input handling, timing, scoring, per-second sampling

const MAX_EXTRA = 8; // extra letters allowed past the end of a word

class TypingTest {
  // opts: { mode: "time"|"words", value: seconds|wordCount, target: 0-100,
  //         onTick(test), onFinish(test) }
  constructor(opts, els) {
    this.opts = opts;
    this.els = els; // { words, caret, timer }

    const initialCount =
      opts.mode === "words" ? opts.value : Math.max(60, opts.value * 4);
    const gen = generateTest(initialCount, opts.target);
    this.feeder = gen.feeder;
    this.words = gen.words.map((w) => ({
      target: w.text,
      difficulty: w.difficulty,
      typed: "",
      committed: false,
      correct: null,
    }));

    this.wordIndex = 0;
    this.started = false;
    this.finished = false;
    this.startTime = 0;
    this.elapsed = 0;

    // keystroke accounting (monkeytype-style: correct / incorrect / extra / missed)
    this.hits = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
    this.correctChars = 0; // committed correct chars incl. spaces, for WPM
    this.rawChars = 0; // all committed chars incl. spaces

    // per-second samples for the chart: { sec, wpm, raw, errors }
    this.samples = [];
    this.secErrors = 0;
    this.secRaw = 0;
    this.lastSample = 0;

    this.render();
    this.updateTimer();
  }

  // --- input -------------------------------------------------------------

  handleKey(e) {
    if (this.finished) return false;
    const word = this.words[this.wordIndex];

    if (e.key === "Backspace") {
      if (e.ctrlKey || e.altKey || e.metaKey) {
        if (word.typed) word.typed = "";
        else this.stepBack();
      } else if (word.typed) {
        word.typed = word.typed.slice(0, -1);
      } else {
        this.stepBack();
      }
      this.renderWord(this.wordIndex);
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
    if (pos < word.target.length) {
      if (e.key === word.target[pos]) this.hits.correct++;
      else {
        this.hits.incorrect++;
        this.secErrors++;
      }
    } else {
      this.hits.extra++;
      this.secErrors++;
    }

    this.renderWord(this.wordIndex);
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
    this.scrollToCurrent();
  }

  commitWord() {
    const word = this.words[this.wordIndex];
    word.committed = true;
    word.correct = word.typed === word.target;

    const missed = Math.max(0, word.target.length - word.typed.length);
    this.hits.missed += missed;

    // chars for wpm: typed chars + the space, counted as correct only if the word is perfect
    this.rawChars += word.typed.length + 1;
    if (word.correct) this.correctChars += word.target.length + 1;

    this.renderWord(this.wordIndex);
    this.wordIndex++;

    if (this.opts.mode === "words" && this.wordIndex >= this.words.length) {
      this.finish();
      return;
    }
    if (this.opts.mode === "time" && this.wordIndex >= this.words.length - 30) {
      this.appendWords(30);
    }
    this.scrollToCurrent();
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

    this.opts.onFinish?.(this);
  }

  destroy() {
    clearInterval(this.tickHandle);
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
      frag.appendChild(this.buildWordEl(this.words.length - 1));
    }
    this.els.words.appendChild(frag);
  }

  buildWordEl(index) {
    const word = this.words[index];
    const el = document.createElement("div");
    el.className = "word";
    el.dataset.index = index;
    for (const ch of word.target) {
      const s = document.createElement("span");
      s.textContent = ch;
      el.appendChild(s);
    }
    return el;
  }

  render() {
    this.els.words.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.words.length; i++) {
      frag.appendChild(this.buildWordEl(i));
    }
    this.els.words.appendChild(frag);
    this.els.words.style.transform = "translateY(0)";
    this.renderWord(0);
    requestAnimationFrame(() => this.positionCaret());
  }

  renderWord(index) {
    const word = this.words[index];
    const el = this.els.words.children[index];
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

  positionCaret() {
    const el = this.els.words.children[this.wordIndex];
    const caret = this.els.caret;
    if (!el || this.finished) return;
    const typed = this.words[this.wordIndex].typed.length;
    const letters = el.children;
    let x, y;
    if (typed === 0) {
      x = el.offsetLeft;
      y = el.offsetTop;
    } else {
      const ref = letters[Math.min(typed, letters.length) - 1];
      x = el.offsetLeft + ref.offsetLeft + ref.offsetWidth;
      y = el.offsetTop + ref.offsetTop;
    }
    caret.style.transform = `translate(${x}px, ${y}px)`;
    this.scrollToCurrent();
  }

  scrollToCurrent() {
    const el = this.els.words.children[this.wordIndex];
    if (!el) return;
    const lineH = el.offsetHeight;
    const offset = Math.max(0, el.offsetTop - lineH);
    this.els.words.style.setProperty("--scroll", `${-offset}px`);
  }

  updateTimer() {
    if (this.opts.mode === "time") {
      const left = Math.max(0, this.opts.value - this.elapsed);
      this.els.timer.textContent = Math.ceil(left);
    } else {
      this.els.timer.textContent = `${Math.min(
        this.wordIndex,
        this.words.length
      )}/${this.words.length}`;
    }
  }
}
