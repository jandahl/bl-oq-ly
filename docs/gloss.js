// Shared gloss-formatting helpers used by both Deconstruct (breakdown.js)
// and Build's reading line (app.js), so the same composed-sentence fix
// applies in both places rather than drifting.

/**
 * A mood-marking morpheme's own gloss/shortGloss bakes its moodLabel
 * ("statement", "question", ...) into the string itself — real information
 * (this morpheme marks the indicative/declarative mood), just formatted
 * identically to everything else, which read as one more undifferentiated
 * translation fragment rather than a distinct grammatical category
 * (bl-oq-ly#12). Split it back out. `gloss` uses "label: rest" (the raw
 * scholarly template's own separator); `shortGloss` uses "label — rest".
 */
export function splitMoodLabel(text, moodLabel) {
	if (!moodLabel) return { moodLabel: null, rest: text };
	for (const sep of [": ", " — "]) {
		if (text.startsWith(moodLabel + sep)) return { moodLabel, rest: text.slice(moodLabel.length + sep.length) };
	}
	return { moodLabel: null, rest: text };
}

/**
 * The composed, full-sentence translation oq's own Deconstruct/Build show
 * (e.g. "qimmeqarpunga" -> "I have a dog") isn't a separate function — it's
 * already sitting in the LAST morpheme's own `gloss` field: glossSummaryItems
 * threads each stem/affix's contribution through fillStemSlot's "___"
 * substitution (stemIn/stemOut), so the final item's `gloss` is the whole
 * sentence, not just its own piece. A single composed sentence, unlike a
 * per-morpheme row list, isn't meaningfully "reversible" -- the
 * European-reading-order toggle (bl-oq-ly#11) never applies here, only to
 * the per-morpheme rows below it in Deconstruct.
 * @param {any[]} items - glossSummaryItems(seq)'s return value
 */
export function composedTranslation(items) {
	const last = items[items.length - 1];
	if (!last) return "";
	const { rest } = splitMoodLabel(last.gloss || last.shortGloss || "", last.moodLabel);
	return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "";
}
