# Future Features

A running list of things neontype could become. Nothing here is built yet — this is
the roadmap and the thinking behind it. Rough priority order within each section, but
none of it is committed.

---

## 1. Research data collection (the big one)

**Vision:** turn neontype from a typing toy into a research tool by recording rich,
per-keystroke data and, over time, building an anonymized dataset of real typing
behavior — the kind of thing the [Aalto 136M Keystrokes dataset](https://userinterfaces.aalto.fi/136Mkeystrokes/)
is, but our own.

### What to record

Per test, per word, per keystroke:

- **Per-keystroke:** the key pressed, the expected key, correct/incorrect/extra flag,
  and a high-resolution timestamp (`performance.now()`).
- **Derived inter-key intervals:** time between consecutive keystrokes — the core signal
  for "how long does it take to type this letter pair / this word." This is what lets us
  eventually replace the heuristic difficulty model with empirical per-word timings.
- **Per-word:** the target word, what was actually typed, its graded difficulty, wall-clock
  time to type it, and error count.
- **Per-test:** mode, library, target difficulty, achieved WPM/raw/accuracy/consistency,
  and the config that produced it.
- **Session/user context (opt-in, see disclaimer below):** a random anonymous ID so a
  user's tests can be linked over time without knowing who they are; optionally
  self-reported keyboard layout and coarse device class (desktop/laptop/phone).

### Where to store it

Staged, cheapest-first:

1. **Local first (no backend):** keep the full per-keystroke log in `localStorage` or
   `IndexedDB` (IndexedDB is the right call once logs get large). Add an **"export my
   data"** button that downloads the user's own history as JSON/CSV. This alone makes it a
   usable personal research tool with zero infrastructure and zero privacy risk — the data
   never leaves the machine.
2. **Optional cloud upload:** a small backend endpoint that accepts anonymized test
   records. A static GitHub Pages site can't host this, so options are a serverless
   function (Cloudflare Workers, Vercel, Netlify Functions), a hosted DB with a public
   insert-only API (Supabase), or a plain form-to-sheet service. Insert-only, no reads —
   contributors send data, they don't pull it.
3. **Dataset publishing:** periodically export the aggregated anonymized corpus (e.g. to a
   GitHub release, Kaggle, or Hugging Face Datasets) so others can use it, with a clear
   data license and a datasheet describing collection method and limitations.

### What the dataset unlocks

- **Empirical difficulty model** — fit the difficulty weights (or replace them entirely)
  against real inter-key intervals instead of the current motor+frequency heuristic. This
  is already the top item in the README roadmap; the data collection is the prerequisite.
- **Per-word "average human typing time"** — the thing that didn't exist as a lookup table
  when this started. With enough data we can derive it directly.
- **"Time to write" estimator** — once average time-per-word is known, estimate how long it
  would take to *type* a given text: paste a passage (or point at a book's word list) and
  get a predicted typing time from the per-word timings. A headline research output.
- **Build our own per-word timing library** — accumulate real samples for every word in the
  bank, so the difficulty grade for each word is backed by measured data rather than the
  heuristic model.
- **Personal analytics** — a user's slowest letter pairs, most-missed words, speed over
  time, consistency trends.

### Data quality: filtering false data

Crowd-sourced typing data is noisy — bots, autofill, paste, someone mashing keys, or a
practiced typist on a familiar passage all skew the "average." To keep the dataset honest:

- **Speed sanity limits** — reject or flag words/tests typed implausibly fast (above a
  human ceiling, e.g. samples implying >250–300 WPM sustained) as likely paste/bot/autofill.
- **Per-user average bounds** — compare a sample against that anonymous user's own running
  average; a sudden huge deviation is suspect and can be down-weighted rather than trusted.
- **Reject non-organic input** — ignore pasted text and synthetic key events (real typing
  has natural inter-key jitter; paste arrives as one event, bots are often too regular).
- **Minimum sample counts** — don't report a per-word average until enough independent
  samples exist for it to mean anything.

### Ethics & rigor (do this before collecting anything real)

- Keystroke timing is **biometric-adjacent** — keystroke dynamics can identify individuals.
  Treat it as sensitive even when "anonymous."
- Record only what the research question needs; never capture keystrokes outside the test
  input (no global keylogging — only what's typed into the test).
- If this is ever used for actual human-subjects research, it needs real informed consent
  and likely IRB/ethics review. Bake that in rather than bolting it on.

---

## 2. Privacy disclaimer & opt-out (ships WITH data collection, not after)

Data collection must be **off by default or gated behind a clear, upfront choice** — never
silent. Requirements:

- A **first-visit disclaimer**: plainly explain what's recorded (keystrokes and their
  timings within the test), why (to build a typing-research dataset and power personal
  analytics), where it goes (local only, or uploaded if they opt in), and that it's
  anonymous. No dark patterns.
- A persistent **settings toggle** to turn collection on/off at any time — under the
  existing "experience" section of the settings drawer feels natural.
- **"Delete my data"** and **"export my data"** buttons — the user owns their history.
- **Off means off:** when disabled, record nothing, not even locally.
- Ship this *in the same release* as any collection feature. Collecting first and adding
  the disclaimer later is exactly the wrong order.

---

## 3. Color scheme toggles

Right now the neon-purple/magenta theme is hardcoded via CSS custom properties on
`:root`. The variables are already centralized ([css/style.css](css/style.css)), so
theming is mostly a matter of swapping variable sets.

- **Theme picker** in the settings drawer (or a quick toggle in the header) that swaps the
  `--bg`, `--accent`, `--magenta`, etc. custom properties.
- **Starter themes:** the current neon (default), plus e.g. a cool cyan/blue, an amber/CRT
  green terminal look, a high-contrast light theme, and a muted/low-glow variant for
  people who find the neon glow tiring.
- **Persist** the chosen theme in `localStorage` alongside the other settings.
- **Accessibility:** any new theme's chart series colors should be re-run through the
  colorblind/contrast validation the current palette already passed, so the results chart
  stays legible in every theme.
- Optional: respect `prefers-color-scheme` for the initial default.

---

## 4. Smaller ideas (already noted in the README / worth doing)

- **Smooth-caret setting** — expose the caret smoothing speed (off / fast / medium / slow)
  as a user setting instead of the hardcoded time constant, the way established typing
  tests do.
- **Punctuation & numbers toggles** — mix in capitalized words, punctuation, and digits.
- **Quote mode** — type real passages instead of random words.
- **More/bigger word libraries** — import a larger frequency-ranked corpus (e.g. Google
  Books n-grams) for the english library.
- **Fit the difficulty model to real data** — see section 1; the current model is a
  heuristic until there's a dataset to fit it against.
