// Renders a Deconstruct result as oq's own Deconstruct view does: a
// composed, full-sentence translation, then a per-morpheme row breakdown
// below it (declared/citation spelling + a short, blank-filled gloss) —
// rather than raw morpheme ids in a block stack (bl-oq-ly#4: ids like
// "N_qaq_Vb" mean nothing to a learner). Deliberately plain HTML, not
// Blockly: the read-only case has no drag/snap interaction to justify
// Blockly's overhead, and a flex-wrapping row list is far more usable on a
// small screen than a read-only block stack would be.

/**
 * A mood-marking morpheme's own gloss/shortGloss bakes its moodLabel
 * ("statement", "question", ...) into the string itself — real information
 * (this morpheme marks the indicative/declarative mood), just formatted
 * identically to everything else, which read as one more undifferentiated
 * translation fragment rather than a distinct grammatical category
 * (bl-oq-ly#12). Split it back out. `gloss` uses "label: rest" (the raw
 * scholarly template's own separator); `shortGloss` uses "label — rest".
 */
function splitMoodLabel(text, moodLabel) {
	if (!moodLabel) return { moodLabel: null, rest: text };
	for (const sep of [": ", " — "]) {
		if (text.startsWith(moodLabel + sep)) return { moodLabel, rest: text.slice(moodLabel.length + sep.length) };
	}
	return { moodLabel: null, rest: text };
}

/**
 * The composed, full-sentence translation oq's own Deconstruct shows (e.g.
 * "qimmeqarpunga" -> "I have a dog") isn't a separate function — it's
 * already sitting in the LAST morpheme's own `gloss` field: glossSummaryItems
 * threads each stem/affix's contribution through fillStemSlot's "___"
 * substitution (stemIn/stemOut), so the final item's `gloss` is the whole
 * sentence, not just its own piece. Missing this was this repo's own bug,
 * not a gap in oq's public API.
 */
function composedTranslation(items) {
	const last = items[items.length - 1];
	if (!last) return "";
	const { rest } = splitMoodLabel(last.gloss || last.shortGloss || "", last.moodLabel);
	return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "";
}

/**
 * @param {HTMLElement} container
 * @param {string} word - the surface form that was analyzed
 * @param {any[]} seq - the winning candidate's seq[] (buildWord-shaped items)
 * @param {{ word: string, approximate: boolean, closed: boolean }} buildResult
 * @param {(seq: any[], opts?: any) => any[]} glossSummaryItems
 * @param {{ reverseOrder?: boolean }} [opts] - bl-oq-ly#11: read last-morpheme-first
 *   in the per-morpheme ROW list below the translation (e.g. "statement —
 *   I" / "to have a" / "dog" for a word literally ordered dog-have-statement).
 *   Never affects the composed translation line itself, which is a single
 *   sentence, not a reversible list.
 */
export function renderBreakdown(container, word, seq, buildResult, glossSummaryItems, opts = {}) {
	container.innerHTML = "";

	const heading = document.createElement("div");
	heading.className = "breakdown-word";
	heading.textContent = (buildResult.approximate ? "≈ " : "") + buildResult.word;
	container.appendChild(heading);

	const allItems = glossSummaryItems(seq);
	const translation = composedTranslation(allItems);
	if (translation) {
		const translationEl = document.createElement("p");
		translationEl.className = "breakdown-translation";
		translationEl.textContent = translation;
		container.appendChild(translationEl);
	}

	let items = allItems.filter((item) => item.marker !== "Ø");
	if (opts.reverseOrder) items = items.slice().reverse();

	const rows = document.createElement("div");
	rows.className = "breakdown-rows";
	for (const item of items) {
		const row = document.createElement("div");
		row.className = "breakdown-row";

		const spelling = document.createElement("span");
		spelling.className = "breakdown-spelling";
		spelling.textContent = `${item.marker}${item.text}`;
		row.appendChild(spelling);

		const { moodLabel, rest } = splitMoodLabel(item.shortGloss || item.gloss || item.meaning || "(no gloss)", item.moodLabel);
		if (moodLabel) {
			const badge = document.createElement("span");
			badge.className = "breakdown-mood";
			badge.textContent = moodLabel;
			row.appendChild(badge);
		}

		const gloss = document.createElement("span");
		gloss.className = "breakdown-gloss";
		gloss.textContent = rest;
		row.appendChild(gloss);

		rows.appendChild(row);
	}
	container.appendChild(rows);

	if (!buildResult.closed) {
		const note = document.createElement("p");
		note.className = "breakdown-note";
		note.textContent = "Mid-derivation — this chain doesn't end in a word-final morpheme.";
		container.appendChild(note);
	}
}
