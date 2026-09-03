// Re-exports oq's experimental public API. jandahl/oq's SOURCE repo is
// private, so a commit-pinned CDN URL (jsdelivr/raw.githubusercontent
// against the repo) is not reachable from a browser — the only live copies
// are oq's own published deployments, which public-api.md's own Quick Start
// already assumes as the consumption path. `public-api.md`'s stability
// posture is explicit ("API_VERSION is 0.x, any commit may rename, reshape,
// or drop any export"), so which deployment this points at is a live,
// tracked decision — see README.md for the current choice and why.
//
// Point at the versioned Pages distribution rather than an unversioned
// deployment tracking oq's development branch. The published package path
// is v0.0.4; its API_VERSION is reported separately by oq itself.
const OQ_API_URL = "https://jandahl.github.io/oq-api/api/v0.0.4/public-api.js";

export const {
	buildWord,
	analyzeWord,
	analyzeWordAsync,
	morphemeEntryToPreset,
	mergeMorphemeSources,
	glossSummary,
	glossSummaryItems,
	API_VERSION,
	GRAMMAR_MORPHEMES_URL,
	// Resolved conjugation labels (oq#881, API_VERSION 0.8.0+) — the same
	// friendly text oq's own "conjugate to..." modal shows for a mood/person
	// paradigm coordinate, so the verb ending picker doesn't have to
	// re-derive its own wording independently. See verb-endings.js.
	resolveMoodLabel,
	resolvePersonLabel,
	resolveFieldLabel,
	t,
	setActiveLocale,
	getActiveLocale,
	WORD_CLASS_THEMES,
	getWordClassColors,
} = await import(/* @vite-ignore */ OQ_API_URL);
