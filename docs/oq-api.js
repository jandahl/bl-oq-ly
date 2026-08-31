// Re-exports oq's experimental public API. jandahl/oq's SOURCE repo is
// private, so a commit-pinned CDN URL (jsdelivr/raw.githubusercontent
// against the repo) is not reachable from a browser — the only live copies
// are oq's own published deployments, which public-api.md's own Quick Start
// already assumes as the consumption path. `public-api.md`'s stability
// posture is explicit ("API_VERSION is 0.x, any commit may rename, reshape,
// or drop any export"), so which deployment this points at is a live,
// tracked decision — see README.md for the current choice and why.
//
// Currently pointed at oq.dicknog.dk (owner's bleeding-edge deployment,
// tracking oq's dev branch rather than oq.spacepope.dk's master) because it
// carries glossSummaryItems on the exported surface — oq.spacepope.dk's
// deployed API_VERSION (0.3.0) didn't yet, which is why breakdown.js used to
// parse glossSummary()'s joined strings instead. Being bleeding-edge cuts
// both ways: expect this to move/break more often than a master-tracked
// deployment would.
const OQ_BASE = "https://oq.dicknog.dk/";

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
} = await import(/* @vite-ignore */ `${OQ_BASE}public-api.js`);
