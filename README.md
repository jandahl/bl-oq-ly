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
  Enclitics, ... — one category per grammarian `lexical_facts.morpheme_type`,
  each its own colour) and snap them into a single top-to-bottom stack, stem
  first. Every block is a fixed, pre-labelled flyout entry (id + short
  gloss) — not a dropdown — so there's no giant `<select>` and no way to
  mistake an affix for a stem; only real morphemes of the right kind ever
  appear in a given category. Every change re-runs oq's real `buildWord()`
  pipeline (morphotactic grammar check → allomorphy → sandhi joins → display
  respelling) and shows the resulting surface form live, or the reason the
  stack doesn't yet form a legal word.
- **Deconstruct**: type an attested Kalaallisut word; oq's `analyzeWord()`
  searches for morpheme sequences that verifiably rebuild it (each candidate
  is checked by actually running it back through `buildWord()`), and the
  best match renders as a per-morpheme gloss breakdown (declared spelling +
  short, blank-filled gloss per row, e.g. `-qaq — to have a dog`), not a raw
  list of morpheme ids.

Blockly's previous/next statement connections do the stack-shape enforcement
for free — a morpheme chain is linear and order-strict (stem first, a
`WORD_FINAL`-continuation closer last), so the block shape simply can't
represent an illegal topology; only an illegal *adjacent join* needs
runtime checking, which is exactly what `buildWord()` reports. Deconstruct's
result is rendered as plain HTML rather than blocks — it's read-only with no
drag/snap interaction to justify Blockly's overhead there, and a
flex-wrapping row list holds up far better on a small screen than a
read-only block stack would.

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
