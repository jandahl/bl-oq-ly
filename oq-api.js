// Re-exports oq's experimental public API. jandahl/oq's SOURCE repo is
// private, so a commit-pinned CDN URL (jsdelivr/raw.githubusercontent
// against the repo) is not reachable from a browser — the only live copy is
// oq's own published GitHub Pages deployment, which public-api.md's own
// Quick Start already assumes as the consumption path. That deployment has
// no per-commit versioning for public-api.js itself (unlike the grammar JSON,
// which does publish v<major> snapshots — see grammarian's CLAUDE.md), so
// this always tracks oq's current published `master`. Per public-api.md's
// stability posture ("API_VERSION is 0.x, any commit may rename, reshape, or
// drop any export"), that is a real, documented risk — see README.md.
const OQ_BASE = "https://oq.spacepope.dk/";

export const {
	buildWord,
	analyzeWord,
	analyzeWordAsync,
	morphemeEntryToPreset,
	mergeMorphemeSources,
	glossSummaryItems,
	API_VERSION,
	GRAMMAR_MORPHEMES_URL,
} = await import(/* @vite-ignore */ `${OQ_BASE}public-api.js`);
