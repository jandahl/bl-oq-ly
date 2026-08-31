# bl-oq-ly

A Blockly-based, block-snap learning aid for building and deconstructing
Kalaallisut words — a Scratch-shaped front end over
[`oq`](https://github.com/jandahl/oq)'s morphology engine.

**Status: MVP prototype.** Deliberately not linked from oq's main app; this
is a standalone static site, reachable only by its own direct URL.

## What it does

One canvas, two modes:

- **Build**: drag morpheme blocks from the palette and snap them into a
  single top-to-bottom stack, stem first. Every change re-runs oq's real
  `buildWord()` pipeline (morphotactic grammar check → allomorphy → sandhi
  joins → display respelling) and shows the resulting surface form live, or
  the reason the stack doesn't yet form a legal word.
- **Deconstruct**: type an attested Kalaallisut word; oq's `analyzeWord()`
  searches for morpheme sequences that verifiably rebuild it (each candidate
  is checked by actually running it back through `buildWord()`), and the
  best match renders as a read-only block stack.

Blockly's previous/next statement connections do the enforcement for free —
a morpheme chain is linear and order-strict (stem first, a
`WORD_FINAL`-continuation closer last), so the block shape simply can't
represent an illegal topology; only an illegal *adjacent join* needs
runtime checking, which is exactly what `buildWord()` reports.

## Data sources

- **Engine**: [`jandahl/oq`](https://github.com/jandahl/oq)'s experimental
  `docs/public-api.js` (`buildWord`, `analyzeWordAsync`,
  `mergeMorphemeSources`, `morphemeEntryToPreset`, `GRAMMAR_MORPHEMES_URL`).
  That module carries **no stability promise** while its `API_VERSION` is
  `0.x` — any oq commit may rename, reshape, or drop an export.
  **The `jandahl/oq` source repo is private**, so a commit-pinned CDN URL
  (jsDelivr/raw.githubusercontent against the repo) is not reachable from a
  browser at all — `oq-api.js` imports instead from oq's own published
  GitHub Pages deployment (`https://oq.spacepope.dk/public-api.js`), exactly
  the consumption path `public-api.md`'s own Quick Start assumes. That
  deployment has **no per-commit version pinning** for `public-api.js` itself
  (unlike the grammar JSON, which does publish `v<major>` snapshots — see
  grammarian's CLAUDE.md), so this app always tracks oq's *currently
  published* API. That's a real, live risk given the stated `0.x` posture —
  a breaking oq deploy can break this app with no warning. If/when oq starts
  versioning `public-api.js`'s published URL the way it already does its
  grammar JSON, switch to that; until then, treat a broken build here as a
  cue to check oq's recent commits, not necessarily a bug in this repo.
- **Morpheme catalog**: fetched at runtime from oq's own
  `GRAMMAR_MORPHEMES_URL`, which points at
  [`jandahl-custom-KAL-grammarian`](https://github.com/jandahl/jandahl-custom-KAL-grammarian)'s
  published `morphemes.json`. That data is **hand-authored and not yet
  dictionary-verified** (`meta.authoritative: false` — see that repo's own
  CLAUDE.md); the app surfaces this in its status line rather than hiding
  it. No local copy of grammar data lives in this repo.

## Running locally

No build step. Any static file server works, e.g.:

```bash
python3 -m http.server 8000
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
