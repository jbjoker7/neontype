// neontype difficulty model
//
// There is no public lookup table of "average human typing time per word",
// so difficulty is approximated with a motor + frequency model whose factors
// are the ones the Aalto 136M Keystrokes study (Dhakal et al., CHI 2018)
// found most predictive of typing speed:
//
//   - frequency rank   (rarer words are read and planned slower)
//   - word length
//   - per-key effort   (row reaches, pinky/ring usage, lateral index stretches)
//   - same-finger bigrams  (the strongest motor penalty in the keystroke data)
//   - repeated letters and long same-hand runs
//
// Raw scores are then percentile-normalized across the corpus, so a word's
// difficulty is its rank among all words, 0 (easiest) to 100 (hardest).
// That makes the difficulty slider mean the same thing at every point.

// QWERTY layout: finger 0-7 = L pinky..L index, R index..R pinky; row 0=top 1=home 2=bottom
const KEY_INFO = (() => {
  const rows = [
    ["qwertyuiop", 0],
    ["asdfghjkl", 1],
    ["zxcvbnm", 2],
  ];
  const fingerByCol = [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7];
  const info = {};
  for (const [letters, row] of rows) {
    [...letters].forEach((ch, col) => {
      const finger = fingerByCol[col];
      info[ch] = { row, finger, hand: finger <= 3 ? "L" : "R" };
    });
  }
  return info;
})();

// Lateral index-finger stretches (t g b y h n reach toward the center column)
const STRETCH_KEYS = new Set(["t", "g", "b", "y", "h", "n"]);

function keyEffort(ch) {
  const k = KEY_INFO[ch];
  if (!k) return 1.0; // unknown chars: mildly hard
  let e = [0.45, 0.0, 0.75][k.row]; // top / home / bottom
  if (k.finger === 0 || k.finger === 7) e += 0.55; // pinky
  else if (k.finger === 1 || k.finger === 6) e += 0.25; // ring
  if (STRETCH_KEYS.has(ch)) e += 0.35;
  return e;
}

function rawScore(word, rank, corpusSize) {
  const chars = [...word];
  const len = chars.length;

  let effort = 0;
  let sameFingerBigrams = 0;
  let doubles = 0;
  let longestHandRun = 1;
  let run = 1;

  for (let i = 0; i < len; i++) {
    effort += keyEffort(chars[i]);
    if (i === 0) continue;
    const a = KEY_INFO[chars[i - 1]];
    const b = KEY_INFO[chars[i]];
    if (chars[i] === chars[i - 1]) doubles++;
    else if (a && b && a.finger === b.finger) sameFingerBigrams++;
    if (a && b && a.hand === b.hand) {
      run++;
      longestHandRun = Math.max(longestHandRun, run);
    } else {
      run = 1;
    }
  }

  const rarity = rank / corpusSize; // 0 = most common
  return (
    2.4 * rarity +
    0.30 * len +
    1.0 * (effort / len) +
    1.6 * (sameFingerBigrams / len) +
    0.6 * (doubles / len) +
    0.25 * Math.max(0, longestHandRun - 3)
  );
}

// Build the scored corpus: [{ text, difficulty }], difficulty = percentile 0-100.
const CORPUS = (() => {
  const scored = WORDS.map((text, rank) => ({
    text,
    raw: rawScore(text, rank, WORDS.length),
  }));
  const order = [...scored].sort((a, b) => a.raw - b.raw);
  order.forEach((w, i) => {
    w.difficulty = Math.round((i / (order.length - 1)) * 100);
  });
  return scored.map(({ text, difficulty }) => ({ text, difficulty }));
})();

// ---------------------------------------------------------------------------
// Test generation: the average guarantee
//
// Words are drawn from a band around the target difficulty (so a hard test
// FEELS hard everywhere, not easy words averaged against brutal ones), and
// each pick greedily steers the running mean back toward the target. The
// resulting test's mean difficulty lands within ~±2 of the target.
// ---------------------------------------------------------------------------

const BAND = 16; // half-width of the sampling band
const CANDIDATES = 28; // random candidates considered per slot
const TOP_POOL = 8; // pick randomly among this many best candidates
const NO_REPEAT = 8; // don't reuse any of the last N words

function bandPool(target) {
  let band = BAND;
  let pool;
  do {
    pool = CORPUS.filter((w) => Math.abs(w.difficulty - target) <= band);
    band += 6;
  } while (pool.length < 60 && band < 120);
  return pool;
}

// A feeder steers the running mean toward the target word by word, so it
// works for fixed-length tests and endless time-mode streams alike.
class WordFeeder {
  constructor(target) {
    this.target = target;
    this.pool = bandPool(target);
    this.sum = 0;
    this.count = 0;
    this.recent = [];
  }

  next() {
    const candidates = [];
    while (candidates.length < Math.min(CANDIDATES, this.pool.length)) {
      const w = this.pool[Math.floor(Math.random() * this.pool.length)];
      if (this.recent.includes(w.text)) continue;
      if (candidates.some((c) => c.text === w.text)) continue;
      candidates.push(w);
    }
    candidates.sort(
      (a, b) =>
        Math.abs((this.sum + a.difficulty) / (this.count + 1) - this.target) -
        Math.abs((this.sum + b.difficulty) / (this.count + 1) - this.target)
    );
    const pick =
      candidates[Math.floor(Math.random() * Math.min(TOP_POOL, candidates.length))];

    this.sum += pick.difficulty;
    this.count++;
    this.recent.push(pick.text);
    if (this.recent.length > NO_REPEAT) this.recent.shift();
    return pick;
  }

  average() {
    return this.count ? this.sum / this.count : this.target;
  }
}

function generateTest(count, target) {
  const feeder = new WordFeeder(target);
  const words = [];
  for (let i = 0; i < count; i++) words.push(feeder.next());
  return { words, average: feeder.average(), feeder };
}
