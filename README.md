# ⛩ neontype

A [Monkeytype](https://monkeytype.com)-inspired typing test built from scratch in vanilla
HTML/CSS/JS, wearing a neon-cyberpunk color scheme inspired by the look of *Kamigawa: Neon
Dynasty* — neon purples and magentas glowing against deep violet darkness.

What sets it apart from a plain clone is the **difficulty engine**: you pick a target
difficulty from 0 to 100, and every test is generated so that the *average* difficulty of
its words lands on that target.

## Running it

No build step, no dependencies:

```sh
# either just open index.html in a browser, or:
python3 -m http.server 8000
# → http://localhost:8000
```

## Features

- **Modes** — `time` (15/30/60/120s) and `words` (10/25/50/100)
- **Difficulty presets** — apprentice (15) · samurai (40) · ronin (65) · kami (85), plus a
  free slider from 0–100
- **The average guarantee** — words are sampled from a band around your target (so a hard
  test feels hard *everywhere*, not easy words averaged against brutal ones), and each pick
  greedily steers the running mean back toward the target. The results screen reports the
  achieved average next to your target; it typically lands within ±2.
- **Live stats** — WPM while you type, countdown/word progress
- **Results** — WPM, raw, accuracy, consistency, char breakdown
  (correct/incorrect/extra/missed), test difficulty vs. target, and a WPM-over-time chart
  with per-second raw bursts and error markers (single axis, colorblind-validated series
  colors, hover tooltips, and a data-table fallback)
- **Monkeytype muscle memory** — `tab`/`esc` restarts, `enter` on the results screen starts
  the next test, backspace into a previous word only if it had errors
- **Personal bests** — stored per mode/value/difficulty in `localStorage`

## How word difficulty is graded

**Is there a database of how long the average human takes to type each word?** Not as a
ready-made per-word lookup table — but the raw material exists. The best public source is
the [Aalto University *136M Keystrokes* dataset](https://userinterfaces.aalto.fi/136Mkeystrokes/)
([Dhakal, Feit, Kristensson & Oulasvirta, CHI 2018](https://dl.acm.org/doi/pdf/10.1145/3173574.3174220)):
136 million keystrokes from 168,000 people transcribing English sentences, with per-keypress
timestamps. From it you can derive empirical inter-key intervals for any letter pair and,
by extension, average typing time for any word. Two of its findings shape this project's
model: letter pairs typed by the **same finger** are the strongest drag on speed, and
hand/finger alternation is more predictive of speed than letter repetition.

Since shipping a derived per-word timing table isn't practical for a static site, neontype
grades each word with a motor + frequency model built from those findings
([js/difficulty.js](js/difficulty.js)):

| Factor | Why it matters |
|---|---|
| Frequency rank | Rare words are read and motor-planned slower |
| Word length | Longer words cost more keystrokes and more lookahead |
| Per-key effort | Row reaches, pinky/ring keys, and lateral index stretches (t/g/b/y/h/n) are slower |
| Same-finger bigrams | The single strongest motor penalty in the keystroke data |
| Double letters & same-hand runs | Repetition and no-alternation runs reduce rollover typing |

Raw scores are **percentile-normalized** across the ~1,700-word corpus, so "difficulty 65"
always means "harder than 65% of the corpus" — the slider means the same thing at every
point, and the test average is well-defined.

### Roadmap ideas

- Fit the model's weights against real inter-key intervals from the 136M Keystrokes data
- Import Monkeytype's larger `english_10k` corpus with real frequency ranks
- Quote mode, punctuation/numbers toggles, more themes

## Credits & license

MIT — see [LICENSE](LICENSE). An original implementation: no Monkeytype code is used.
Color scheme is fan-inspired by the aesthetic of *Magic: The Gathering — Kamigawa: Neon
Dynasty*; this project is not affiliated with Wizards of the Coast or Monkeytype.
