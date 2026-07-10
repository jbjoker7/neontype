# neontype

A typing test built from scratch in vanilla HTML/CSS/JS — neon purples and magentas
glowing against deep violet darkness, in the spirit of a rain-slicked cyberpunk cityscape.

What sets it apart is the **difficulty engine**: you pick a target difficulty from 0 to
100, and every test is generated so that the *average* difficulty of its words lands on
that target.

## Running it

No build step, no dependencies, no trackers:

```sh
# either just open index.html in a browser, or:
python3 -m http.server 8000
# → http://localhost:8000
```

It's a fully static site — publish it by dropping the folder on any static host
(GitHub Pages, Netlify, your own server).

## Features

- **Modes** — `time` (15/30/60/120s), `words` (10/25/50/100), and `infinite` (type
  forever; finish with `shift+enter`). Time and infinite modes stream words endlessly —
  you're never limited by word count.
- **Word libraries** — english (~2.5k everyday words), english lite (the 500 most
  common), tech (programming & computing), and neon city (cyberpunk streets &
  circuitry). Each library is difficulty-graded independently.
- **Difficulty presets** — apprentice (15) · samurai (40) · ronin (65) · kami (85), plus
  a free slider from 0–100
- **The average guarantee** — words are sampled from a band around your target (so a hard
  test feels hard *everywhere*, not easy words averaged against brutal ones), and each pick
  greedily steers the running mean back toward the target. The results screen reports the
  achieved average next to your target; it typically lands within ±2.
- **Feel** — a caret that rides inside the scrolling text (no desync), solid while typing
  and blinking when idle, optional synthesized typing sounds (WebAudio, no assets), a
  shake on missed words, entrance animations, count-up results, caps lock warning, and a
  focus-lost blur overlay. Respects `prefers-reduced-motion`.
- **Viewport** — choose 2–5 visible lines of upcoming words
- **Results** — WPM, raw, accuracy, consistency, char breakdown
  (correct/incorrect/extra/missed), test difficulty vs. target, and a WPM-over-time chart
  with per-second raw bursts and error markers (single axis, colorblind-validated series
  colors, hover tooltips, and a data-table fallback)
- **Shortcuts** — `tab`/`esc` restarts, `enter` on the results screen starts the next
  test, backspace into a previous word only if it had errors
- **Personal bests** — stored per mode/length/difficulty/library in `localStorage`

## Settings design

Settings live in two layers, following standard usability heuristics:

- a **quick bar** in the header for the three things you touch constantly (mode, length,
  difficulty), every group labeled so nothing has to be guessed;
- a **settings drawer** (⚙) with grouped sections — test, words, experience — where every
  control has a name and a one-line description, changes apply instantly, the difficulty
  slider explains itself in plain language ("words harder than ~40% of the english
  library"), and toggling sound plays an audible preview. `esc` or the scrim closes it.

## How word difficulty is graded

**Is there a database of how long the average human takes to type each word?** Not as a
ready-made per-word lookup table — but the raw material exists. The best public source is
the [Aalto University *136M Keystrokes* dataset](https://userinterfaces.aalto.fi/136Mkeystrokes/)
([Dhakal, Feit, Kristensson & Oulasvirta, CHI 2018](https://dl.acm.org/doi/pdf/10.1145/3173574.3174220)):
136 million keystrokes from 168,000 people transcribing English sentences, with
per-keypress timestamps. From it you can derive empirical inter-key intervals for any
letter pair and, by extension, average typing time for any word. Two of its findings shape
this project's model: letter pairs typed by the **same finger** are the strongest drag on
speed, and hand/finger alternation is more predictive of speed than letter repetition.

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

Raw scores are **percentile-normalized within the selected library**, so "difficulty 65"
always means "harder than 65% of this library" — the slider means the same thing at every
point, and the test average is well-defined.

### Roadmap ideas

- Fit the model's weights against real inter-key intervals from the 136M Keystrokes data
- Punctuation/numbers toggles, quote mode, more themes
- Import a larger frequency-ranked corpus (e.g. from Google Books n-grams)

## License

MIT — see [LICENSE](LICENSE). All code, word lists, and the difficulty model are original
to this project.


Future features:
I wanna turn it into a research project on average time/word as a dataset to then give metrics on how long it would take to write certain books
I wanna turn it into a research tool to build a library of my own for each word in the bank and set limits on how fast someone types and avg type speed to prevent false data.
