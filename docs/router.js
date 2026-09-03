// Encodes/decodes bl-oq-ly's shareable state -- mode, Deconstruct's word,
// Build's block chain -- to and from the URL's query string, so a learner
// can copy the address bar and hand someone else the exact same view:
// "look at this word", "look at how I built this".
//
// Both `word` and `chain` are kept when present, even if they belong to the
// inactive tab. Dropping the other tab's param on a mode switch is what made
// Build's stack (or Deconstruct's analysis) vanish the moment you clicked
// the other tab and came back — the URL forgot it, and a restore had
// nothing to put back. A link may therefore carry both; the active `mode`
// still decides which view is showing.
//
// Deliberately NOT included: theme, language, spelling mode, show-ids,
// reading order (app.js's own localStorage-backed *_KEY constants). Those
// are "how I like to see things," not "what I'm looking at" -- baking a
// sharer's own display preferences into a link would silently override
// whatever the recipient already has set, for no reason connected to the
// content being shared. Filter text and palette visibility are left out for
// the same reason: transient UI state, not content.
//
// Pure functions only (no DOM/history access) so this module stays plain
// Node-testable, same discipline as gloss.js/verb-endings.js -- app.js owns
// the actual history.pushState/replaceState calls and the popstate listener.

const MODE_VALUES = new Set(["build", "deconstruct"]);

/**
 * Reads {mode, word, chain} out of a URLSearchParams-compatible search
 * string (e.g. `location.search`). Anything missing or invalid falls back
 * to a safe default (`mode: "build"`, `word: ""`, `chain: []`) rather than
 * throwing -- a hand-edited or stale link should degrade gracefully, not
 * break the app on load.
 * @param {string} search
 * @returns {{ mode: "build"|"deconstruct", word: string, chain: string[] }}
 */
export function readState(search) {
	const params = new URLSearchParams(search);
	const mode = params.get("mode");
	const chainRaw = params.get("chain");
	return {
		mode: MODE_VALUES.has(mode) ? mode : "build",
		word: params.get("word") ?? "",
		chain: chainRaw ? chainRaw.split(",").map((s) => s.trim()).filter(Boolean) : [],
	};
}

/**
 * Builds the query string (leading "?", or "" for entirely-default/empty
 * state) for {mode, word, chain}. Omits a param at its default/empty value
 * so an untouched app still links to a bare path, not a query string full
 * of defaults. Both `word` and `chain` are emitted when set, regardless of
 * `mode`, so switching tabs does not drop the other tab's content.
 * @param {{ mode?: string, word?: string, chain?: string[] }} state
 * @returns {string}
 */
export function writeState({ mode, word, chain } = {}) {
	const params = new URLSearchParams();
	if (mode && mode !== "build") params.set("mode", mode);
	if (word) params.set("word", word);
	if (chain && chain.length > 0) params.set("chain", chain.join(","));
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}
