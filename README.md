# bl-oq-ly

A Blockly-based, block-snap learning aid for building and deconstructing
Kalaallisut words — a Scratch-shaped front end over
[`oq`](https://github.com/jandahl/oq)'s morphology engine.

**Status: MVP prototype.** Deliberately not linked from oq's main app; this
is a standalone static site, reachable only by its own direct URL.

## What it does

One page, two modes:

- **Build**: drag morpheme blocks from a categorized Blockly toolbox (Stems
  — nouns, Stems — verbs, Derivational affixes, Inflectional endings,
  Enclitics, ... — one category per grammarian `lexical_facts.morpheme_type`)
  and snap them into a single top-to-bottom stack, stem first. Each category
  is its own Blockly block *type* (`blocks.js`'s `morpheme_block__<category>`)
  with that category's own fixed colour set in `init()` — not one shared
  block type with a per-instance toolbox colour override, which Blockly
  silently ignores. Every block is a fixed, pre-labelled flyout entry (id +
  short gloss) — not a dropdown — so there's no giant `<select>` and no way
  to mistake an affix for a stem; only real morphemes of the right kind ever
  appear in a given category. Every change re-runs oq's real `buildWord()`
  pipeline (morphotactic grammar check → allomorphy → sandhi joins → display
  respelling) and shows the resulting surface form live, or the reason the
  stack doesn't yet form a legal word. A **filter box** above the palette
  narrows the toolbox to matching id/gloss substrings live (a category with
  no matches disappears entirely), and a **Hide/Show palette** button frees
  the full canvas width via Blockly's `Toolbox.setVisible()` — *not*
  `workspace.updateToolbox(null)`, which Blockly rejects once a workspace has
  been injected with a toolbox ("Can't nullify an existing toolbox").
- **Deconstruct**: type an attested Kalaallisut word; oq's `analyzeWord()`
  searches for morpheme sequences that verifiably rebuild it (each candidate
  is checked by actually running it back through `buildWord()`), and the
  best match renders as oq's own Deconstruct does: a composed, full-sentence
  translation first (e.g. `qimmeqarpunga` → "I have a dog"), then a
  per-morpheme breakdown below it (declared spelling + short, blank-filled
  gloss per row, e.g. `-qaq — to have a dog`) — not a raw list of morpheme
  ids. The composed translation isn't a separate function call: it's
  already sitting in the *last* morpheme's own `gloss` field —
  `glossSummaryItems` threads each stem/affix's contribution through a
  `"___"`-slot substitution as it walks the sequence, so the final item's
  `gloss` is the whole sentence, not just its own piece. An earlier version
  of this repo only ever read each item's own `shortGloss` for its row and
  never surfaced this — a bug in how this repo used the API, not a gap in
  oq's public surface (`gloss.js`'s `composedTranslation()`, shared with
  Build's own reading line below — an identical bug existed there too until
  it was pointed out). A **"Move to Word Builder"** button (shown once a
  breakdown renders) switches to
  Build mode and recreates the verified chain as a live, editable block
  stack (`blocks.js`'s `renderChain()`) so the learner can keep
  experimenting from a known-good starting point instead of rebuilding it
  by hand.

Blockly's previous/next statement connections do the stack-shape enforcement
for free — a morpheme chain is linear and order-strict (stem first, a
`WORD_FINAL`-continuation closer last), so the block shape simply can't
represent an illegal topology; only an illegal *adjacent join* needs
runtime checking, which is exactly what `buildWord()` reports. Deconstruct's
result is rendered as plain HTML rather than blocks — it's read-only with no
drag/snap interaction to justify Blockly's overhead there, and a
flex-wrapping row list holds up far better on a small screen than a
read-only block stack would.

### Theme

A three-way Auto/Light/Dark toggle (top right, persisted in `localStorage`)
sets `<html data-theme="...">`, which `style.css` reads (an explicit choice
always wins over the OS; "Auto" falls back to `prefers-color-scheme`). Blockly
itself doesn't read CSS custom properties at all, so its toolbox/flyout/
workspace chrome is themed separately via `theme.js`'s two `Blockly.Theme`
objects and `workspace.setTheme()`, kept in sync with the page's own theme by
`app.js` on every toggle (and live on an OS-level change, while "Auto" is
active). An earlier version forced Blockly's toolbox text to a fixed dark
colour via a blanket CSS override — readable, but meant Blockly's own chrome
could never actually go dark; this replaces that hack with real theming.

### Display options

Two checkboxes under the mode toggle, both persisted:

- **"Read last morpheme first"** (default on). Reverses Deconstruct's
  per-morpheme rows so a European reader's own translation direction reads
  top-to-bottom (e.g. a word literally ordered dog-have-statement lists
  `statement — he/she/it`, then `to have a`, then `dog`). It does **not**
  affect the composed, full-sentence translation line (Deconstruct's own
  and Build's `#reading-line`, both via `gloss.js`'s `composedTranslation()`
  — see below) — a single sentence isn't a reversible list — and
  deliberately **not** the physical Blockly block stack in Build mode
  itself, which always stays stem-first. Flipping the actual stack would
  conflict with two things that must stay stem-first: `buildWord()`'s own
  required sequence order, and the one-directional connection constraints
  below (a stem has no `previousConnection`, a word-final ending has no
  `nextConnection` — those only make sense read in one consistent
  direction).
  **Owner decision**: a fully reversible block stack (build in either
  direction, not just read either direction) is real, tracked future work,
  explicitly deferred rather than dropped — not a toggle to add casually on
  top of the current one-directional connections, since that constraint (and
  `buildWord()`'s own stem-first requirement) would need solving properly
  first, not worked around per-toggle.
- **"Show morpheme ids"** (default off). A block always shows the actual
  Kalaallisut spelling (`preset.expected`, e.g. `qimmeq`, `-qaq`, `+voq`) —
  that's real language, never hidden. This toggle only adds or removes
  grammarian's own *internal* id (`V_IND_INTR_1SG`, `N_qaq_Vb`, ...) on top
  of it, which happens to equal the spelling for a plain stem (its id *is*
  its citation form) but is an opaque code for everything else — useful for
  cross-referencing against grammarian's own data, off by default since it's
  not what a learner needs to see. Toggling relabels every block already on
  the canvas (`blocks.js`'s `relabelBlocks()`), not just future ones.

A mood-marking morpheme's gloss also bakes its own grammatical category
(`moodLabel` — "statement", "question", ...) into the string with the same
em-dash join as everything else, which read as one more piece of translation
rather than a distinct kind of information. Deconstruct separates it into
its own small tag (`+voq` → *(statement)* `he/she/it`); a Build block drops
it entirely instead — there's no room for a second annotation on an
already-compact block label there.

### Directional connections

A stem's block has no `previousConnection` at all (nothing can ever precede
it — it's always leftmost), and a word-final morpheme (an ordinary
inflectional ending or plain enclitic — not a `derivational_enclitic`, which
grammarian's own schema documents as not sealing the word) has no
`nextConnection` (nothing can follow it). Blockly's drag-snap machinery
simply never offers those connection points, so that whole class of illegal
stack is unattachable in the UI, not just rejected after the fact by
`buildWord()`. This only encodes the two structural cases that are always
true regardless of which specific morpheme is involved — it does not attempt
to re-encode morphotactics.js's full join-legality rules (a real engine
concern that belongs in oq) as Blockly connection checks.

## Data sources

- **Engine**: [`jandahl/oq`](https://github.com/jandahl/oq)'s experimental
  `docs/public-api.js` (`buildWord`, `analyzeWordAsync`,
  `mergeMorphemeSources`, `morphemeEntryToPreset`, `glossSummaryItems`,
  `GRAMMAR_MORPHEMES_URL`). That module carries **no stability promise**
  while its `API_VERSION` is `0.x` — any oq commit may rename, reshape, or
  drop an export.
  **The `jandahl/oq` source repo is private**, so a commit-pinned CDN URL
  (jsDelivr/raw.githubusercontent against the repo) is not reachable from a
  browser at all — `oq-api.js` imports instead from a live oq deployment,
  exactly the consumption path `public-api.md`'s own Quick Start assumes.
  Currently pointed at **`https://oq.dicknog.dk/public-api.js`** (owner's
  bleeding-edge deployment, tracking oq's dev branch — `API_VERSION 0.7.0` at
  time of writing, vs. `oq.spacepope.dk`'s master-tracked `0.3.0`), chosen
  specifically because it carries `glossSummaryItems` on the exported
  surface — `oq.spacepope.dk` didn't yet, which is why the breakdown view
  used to parse `glossSummary()`'s joined strings instead of using the
  richer, short-gloss-carrying function directly. Being bleeding-edge cuts
  both ways: expect this to move or break *more* often than a master-tracked
  deployment would, not less. Neither deployment offers per-commit version
  pinning for `public-api.js` itself (unlike the grammar JSON, which does
  publish `v<major>` snapshots — see grammarian's CLAUDE.md), so this app
  always tracks whichever deployment `OQ_BASE` currently points at as of
  *its* latest push, not a fixed commit. If/when oq starts versioning
  `public-api.js`'s published URL the way it already does its grammar JSON,
  switch to that; until then, treat a broken build here as a cue to check
  oq's recent commits on whichever domain `OQ_BASE` names, not necessarily a
  bug in this repo.
- **Morpheme catalog**: fetched at runtime from oq's own
  `GRAMMAR_MORPHEMES_URL`, which points at
  [`jandahl-custom-KAL-grammarian`](https://github.com/jandahl/jandahl-custom-KAL-grammarian)'s
  published `morphemes.json`. That data is **hand-authored and not yet
  dictionary-verified** (`meta.authoritative: false` — see that repo's own
  CLAUDE.md); the app surfaces this in its status line rather than hiding
  it. No local copy of grammar data lives in this repo.

## Running locally

No build step. The site lives in `docs/` (so GitHub Pages can publish
straight from `master`/`docs`, no Actions workflow needed). Any static file
server works, e.g.:

```bash
cd docs && python3 -m http.server 8000
```

Then open `http://localhost:8000/`. (A plain `file://` open won't work —
browsers block ES module imports over `file://`.)

## Scope notes (MVP)

- No persistence, no accounts, no saved workspaces.
- One morpheme catalog (grammarian), fetched fresh on every load — no
  caching/offline support yet.
- Deconstruct shows only the top-ranked verified breakdown, not the full
  ranked list `analyzeWord()` can return.
- Not a substitute for oq's own Word Builder / Deconstruct views — this is a
  separate, more playful presentation of the same underlying engine, for
  exploring the idea of a block-based teaching tool.
