# neontype

A neon-cyberpunk typing test built from scratch in **vanilla HTML/CSS/JS** — no build step, no
dependencies, no bundler, no framework. Its distinguishing feature is a difficulty engine: you
pick a target 0–100 and each test is generated so the *average* word difficulty lands on it.
Fully static site; repo: `github.com/jbjoker7/neontype`.

## Read first
- `README.md` — features, run instructions, and the full explanation of the difficulty model
  (motor + frequency, derived from the Aalto 136M Keystrokes study). Read for any "why does it
  work this way" question.
- `FUTURE_FEATURES.md` — the roadmap (per-keystroke research data collection, privacy/opt-in,
  theme toggles, quote/punctuation modes). Nothing here is built yet; read before adding features.

## Run / test
No install, no dependencies. Either open `index.html` directly in a browser, or serve it:
```sh
python3 -m http.server 8000   # → http://localhost:8000
```
There is **no build, no test suite, and no CI** — verify changes by loading the page in a browser.
The `.gitignore` lists `node_modules/` but there is no `package.json`.

## Layout
- `index.html` — single page; loads the JS files below via plain `<script>` tags **in order**.
- `css/style.css` — all styling; theme is CSS custom properties on `:root` (`--bg`, `--accent`,
  `--magenta`, etc.).
- `js/words.js` — word corpus (`RAW_WORDS`), listed in frequency order.
- `js/difficulty.js` — the difficulty grading model (`generateTest`, per-word scoring).
- `js/engine.js` — `TypingTest`: input, timing, scoring, per-second sampling.
- `js/sound.js` — `Sound`: synthesized typing clicks (WebAudio, no audio assets).
- `js/chart.js` — `ResultChart`: canvas WPM-over-time results chart.
- `js/main.js` — UI wiring: quick bar, settings drawer, test lifecycle, results.

## Gotchas / conventions
- **No modules/bundler.** Files communicate via globals (`generateTest`, `TypingTest`, `Sound`,
  `ResultChart`). The `<script>` order in `index.html` (words → difficulty → sound → engine →
  chart → main) is load-bearing — a new file must be added there in dependency order.
- **Difficulty is percentile-normalized within the selected library**, so "difficulty 65" always
  means "harder than 65% of *this* library." The achieved average typically lands within ±2.
- **Word order = frequency rank.** In `words.js` the array index is used as the word's frequency
  rank by the model, so ordering matters more than exact counts; duplicates are removed at load.
- **The caret element lives inside `#words`** so the scroll transform moves caret and text as one
  unit — see the comment in `engine.js`; measuring caret offsets against a transformed ancestor
  is what caused past caret-desync bugs. Be careful moving it.
- Settings and personal bests persist in `localStorage`. UI respects `prefers-reduced-motion`.
- Chart series colors (`#a855f7` / `#0891b2` + error `#ff3b6b`) are validated for colorblind
  separation and contrast — re-validate if you change them or add themes.
