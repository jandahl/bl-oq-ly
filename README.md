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
  with that category's own oq word-class style set in `init()` — not one shared
  block type with a per-instance toolbox colour override, which Blockly
  silently ignores. Every block is a fixed, pre-labelled flyout entry
  (morpheme + short gloss by default) — not a dropdown — so there's no giant `<select>` and no way
  to mistake an affix for a stem; only real morphemes of the right kind ever
  appear in a given category. Every change re-runs oq's real `buildWord()`
  pipeline (morphotactic grammar check → allomorphy → sandhi joins → display
  respelling) and shows the resulting surface form live, or the reason the
  stack doesn't yet form a legal word. A **filter box** above the palette
  narrows the toolbox by Kalaallisut surface form, alternate searchable form,
  internal API id, or English/Danish gloss (a category with no matches
  disappears entirely), and a **Hide/Show palette** button frees
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
always wins over the OS; "Auto" falls back to `prefers-color-scheme`). The
Builder page also offers a persisted Blockly theme choice (Classic or Zelos).
Blockly itself doesn't read CSS custom properties at all, so its toolbox/flyout/
workspace chrome is themed separately via `theme.js`'s theme objects and
`workspace.setTheme()`, kept in sync with the page's own theme by `app.js` on
every toggle (and live on an OS-level change, while "Auto" is active). An
earlier version forced Blockly's toolbox text to a fixed dark
colour via a blanket CSS override — readable, but meant Blockly's own chrome
could never actually go dark; this replaces that hack with real theming.
Block and toolbox-category colors come from oq's public
`WORD_CLASS_THEMES`/`getWordClassColors()` API: nominal, verbal,
derivational, inflectional, and enclitic blocks therefore use the same
canonical hierarchy palette as oq instead of locally invented hues.

### Display options

The display controls under the mode toggle are persisted:

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
- **Morpheme display** (`#opt-spelling`, show before gloss / show without
  gloss / hide). "Show before gloss" is the default and prepends the
  catalog's morpheme form to its explanation: `-nngit — negation, ___ not`.
  The other modes support recall practice by showing the morpheme alone or
  hiding it in favour of the gloss. This is the learner-facing identity of a
  block and is deliberately distinct from its internal API id.
- **"Add internal API ids"** (default off). Grammarian's opaque ids
  (`V_IND_INTR_1SG`, `N_qaq_Vb`, ...) are optional diagnostics for
  cross-referencing the source data. When enabled, an id follows the entire
  learner-facing block label; it never occupies the morpheme's leading
  position. Toggling relabels every block already on the canvas (`blocks.js`'s
  `relabelBlocks()`), not just future ones.

A mood-marking morpheme's gloss also bakes its own grammatical category
(`moodLabel` — "statement", "question", ...) into the string with the same
em-dash join as everything else, which read as one more piece of translation
rather than a distinct kind of information. Deconstruct separates it into
its own small tag (`+voq` → *(statement)* `he/she/it`); a Build block drops
it entirely instead — there's no room for a second annotation on an
already-compact block label there.

Gloss language is persisted as well:

- **Language** (`#opt-lang`, English/Dansk). Selects which of grammarian's
  own `plain_gloss.en`/`da` (and `en_short`/`da_short`) fields block labels
  and Deconstruct's translation line draw from, via `glossSummaryItems(seq,
  {lang})`. Danish coverage isn't complete across every entry yet (a
  grammarian-side rollout in progress); a missing Danish gloss falls back to
  English rather than showing nothing.

### Shareable links

`docs/router.js` keeps the address bar in sync with what's actually on
screen, so copying it hands someone else the exact same view:

- **Build**: the on-canvas chain — `?chain=qimmeq,N_qaq_Vb,V_IND_INTR_1SG`.
  Kept live via `history.replaceState` on every canvas change (no history
  spam from every drag).
- **Deconstruct**: the analyzed word, once a verified breakdown is found —
  `?mode=deconstruct&word=qimmeqarpunga`. Pushed via `history.pushState`
  (a real, Back/Forward-navigable moment), not on every keystroke or a
  failed/no-match attempt.
- Switching mode also pushes a history entry, so Back/Forward steps through
  mode switches the way a learner would expect.

Loading either kind of link restores it automatically: a `chain` link
rebuilds the same stack via `renderChain()`; a `mode=deconstruct&word=...`
link re-runs the analysis. A bare `/` (nothing to restore) is left alone
entirely, so the ordinary "Loaded N morphemes" startup message isn't
immediately overwritten by Build's own empty-canvas status.

Deliberately **not** in the URL: theme, language, spelling mode, show-ids,
reading order, or the palette filter. Those are "how I like to see things,"
not "what I'm looking at" — baking a sharer's own display preferences into
a link would silently override whatever the recipient already has set, for
no reason connected to the content being shared. They stay in
`localStorage` (see "Display options" above), same as before this feature.

### Verb ending picker

"Inflectional endings" replaces ~278 individual verb-mood ending entries
(one per real mood × transitivity × subject × object combination — a flat
scroll no learner should have to search) with a single conjugation-style
picker block at the top of the category (bl-oq-ly#18). Three plain Blockly
fields — mood, polarity, and subject — resolve live to a real morpheme id
shown on the parent (`buildWord`'s own spelling + gloss). The polarity field
depends on the selected mood, so affirmative and negative endings are not
hidden as opaque variants. A "variant" dropdown remains only when multiple
endings still share the same complete coordinate. `docs/verb-endings.js`
builds the paradigm index from the grammarian's own catalog and looks up
candidates by coordinate; `docs/blocks.js` owns the block/field wiring.

The subject menu is also constrained by the selected mood and by whether an
object is plugged in, so Question and Command offer only the persons for
which the API has a real ending. Ordinary negative Statement and Question
are composed with the separate `-nngit` sentential-affix block; the catalog's
negative inflectional endings are the special Contemporative forms, so the
picker does not invent unsupported negative endings for other moods.

The object is the third typed puzzle-piece value
socket (`OBJECT_SLOT`), dangling and optional the same way a math block's
own operand socket can sit empty (bl-oq-ly#20 follow-up). Plugging a small
object-selector block (its own "I"/"you"/"he, she, it"/... dropdown,
`morpheme_block__verb_object`) into it makes the ending transitive and
supplies the object's person/number; leaving it unplugged is intransitive.
This is the idiomatic Blockly mechanism for "an optional choice that also
carries its own value" — a learner physically connecting or disconnecting
the object block IS the with/without-an-object choice, not a yes/no
dropdown plus a second, conditionally-visible one. Since a field validator
can only observe changes to a block's OWN fields, reacting to a plug/unplug
(or to the connected object block's own dropdown changing) needs a
different hook: `registerVerbPickerReactivity()` installs one
workspace-level change listener (wired up once, right after
`Blockly.inject()`) that re-resolves every picker block on the workspace
whenever a relevant Blockly event fires, however the event happens — real
drag, or programmatic `.connect()`/`.setFieldValue()` alike.

Subject and object are each a single combined
"I"/"you"/"he, she, it"/... choice (not separate person and number
dropdowns) — the same pairing oq's own "conjugate to..." modal uses. Label
text throughout (mood names, person/number wording) comes from oq's public
API (`resolveMoodLabel`/`resolvePersonLabel`, oq#881) — the exact
plain-language wording oq's own conjugation modal shows by default
("statement", not "indicative"), honoring the visitor's stored pronoun
preference for the two gendered combinations (3sg/4sg) — rather than this
repo maintaining an independent rendering of the same categories. Both
functions are threaded in as parameters from `app.js` (which is the only
module that imports `oq-api.js`'s live, network-backed re-export of oq's
public API) rather than imported directly by `verb-endings.js`/`blocks.js`,
so those two stay plain, dependency-free and unit-testable under Node.

A verb ending block placed on the canvas any other way -- Deconstruct's
"Move to Word Builder," or restoring a shared `?chain=...` link -- is a real
picker instance too, with mood/polarity/subject fields set to match that
exact id, an object block connected for a transitive ending, and the variant
dropdown set when the complete coordinate is ambiguous -- not a frozen label
with no dropdowns at all (bl-oq-ly#20). `blocks.js`'s `renderChain()` builds
these via `restoreVerbPickerFields()`.

### Mobile

- **Pinch-to-zoom** is enabled on the Blockly workspace (`zoom.pinch` at
  injection) — Blockly doesn't turn this on by default, and a phone-width
  viewport otherwise has no way to zoom the canvas at all (bl-oq-ly#20).
- The toolbox tree's own width is capped on a narrow viewport (≤480px),
  with a smaller label font rather than truncation — Blockly sizes the tree
  to its longest category label ("Derivational affixes (576)") by default,
  which measured out to ~60% of the canvas width on a 390px-wide phone,
  leaving well under half the already-narrow view actually usable even
  before a category's flyout opens on top of it.

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

- **Engine**: the versioned [`oq-api`](https://jandahl.github.io/oq-api/)
  browser package (`buildWord`, `analyzeWordAsync`,
  `mergeMorphemeSources`, `morphemeEntryToPreset`, `glossSummaryItems`,
  `GRAMMAR_MORPHEMES_URL`). That module carries **no stability promise**
  while its `API_VERSION` is `0.x` — any oq commit may rename, reshape, or
  drop an export.
  **The `jandahl/oq` source repo is private**, so a commit-pinned CDN URL
  (jsDelivr/raw.githubusercontent against the repo) is not reachable from a
  browser at all — `oq-api.js` imports the published package entry point
  `https://jandahl.github.io/oq-api/api/v0.0.1/public-api.js`. The package
  path is `v0.0.1`; the module's separate `API_VERSION` currently reports
  the underlying engine's `0.9.0`. Treat a broken build as a cue to inspect
  the published package contract and its upstream data source, not
  necessarily as a bug in this repo.
- **Morpheme catalog**: fetched at runtime from oq's own
  `GRAMMAR_MORPHEMES_URL`, which points at
  [`jandahl-custom-KAL-grammarian`](https://github.com/jandahl/jandahl-custom-KAL-grammarian)'s
  published `morphemes.json`. That data is **hand-authored and not yet
  dictionary-verified** (`meta.authoritative: false` — see that repo's own
  CLAUDE.md); the app surfaces this in its status line rather than hiding
  it. No local copy of grammar data lives in this repo.

## Running locally

The site lives in `docs/` (so GitHub Pages can publish straight from
`master`/`docs`, no Actions workflow needed). Blockly is pinned in
`package.json`/`package-lock.json` and bundled into the committed
`docs/vendor/blockly.js` artifact. Rebuild that artifact after dependency
changes, then use any static file server, e.g.:

```bash
npm install
npm run build:vendor
npm run serve
```

Then open `http://localhost:8000/`. (A plain `file://` open won't work —
browsers block ES module imports over `file://`.)

## Testing

`docs/` itself stays a plain, dependency-free static site — this section's
tooling (`package.json`, `node_modules/`, ESLint, Playwright) exists purely
for development/CI and is never fetched by the deployed page.

```bash
npm install
npm run lint       # ESLint over docs/ and test/ — correctness rules only,
                    # no style/formatting opinions, so it never fights the
                    # existing code's own formatting
npm run test:unit  # node --test over test/unit/ — pure logic only
                    # (gloss.js, blocks.js's Blockly-independent exports),
                    # zero extra dependency beyond Node itself
npm run test:e2e   # Playwright, a real headless Chromium against the real
                    # app — see below
npm test           # unit + e2e
```

**Why an E2E suite, and why it hits live endpoints.** Most of this repo's
real regressions so far were invisible to a human reading the diff: Blockly
silently ignoring a per-instance toolbox colour override, `updateToolbox
(null)` throwing, a connection constraint that was *too* restrictive and
blocked a legal construction, a translation line quietly reading the wrong
field. Every one of those was only caught by actually driving the app in a
real browser — until this pass, that verification only ever existed as a
one-off script written by hand each round and thrown away afterward.
`test/e2e/app.spec.js` codifies those exact checks so they run on every
push instead of only when someone happens to remember to re-check by hand;
each test names which past bug it guards against.

`playwright.config.js` points the E2E suite at the published oq-api package
and grammarian's live published catalog, not frozen local fixtures — see that
file's own comment. This repo's stated posture throughout is that a broken
build can be this repo's own bug *or* an upstream oq/grammarian break (both
carry no stability promise — see "Data sources" above), and only testing
against a snapshot would hide the second kind entirely. **A red E2E run in
CI is real information either way** — check which it is (the failure names
the assertion; a `buildWord`/`analyzeWord`/`glossSummaryItems` shape change
upstream reads differently from a real regression in this repo's own diff)
before assuming it's this repo's fault to fix.

`test/unit/` covers the Blockly-independent pure logic directly (fast,
no browser, easy to pin exact input/output shapes) — `test/e2e/` covers
everything that actually depends on Blockly's or the DOM's real behaviour,
which past experience here says cannot be reliably reasoned about from
reading the source alone.

CI (`.github/workflows/ci.yml`) runs lint + unit tests, and the E2E suite,
on every push and PR.

## Scope notes (MVP)

- No persistence, no accounts, no saved workspaces.
- One morpheme catalog (grammarian), fetched fresh on every load — no
  caching/offline support yet.
- Deconstruct foregrounds the top-ranked verified breakdown and keeps any
  lower-ranked verified breakdowns folded below it, each with its own link
  back to the Word Builder.
- Not a substitute for oq's own Word Builder / Deconstruct views — this is a
  separate, more playful presentation of the same underlying engine, for
  exploring the idea of a block-based teaching tool.
