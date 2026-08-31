// Renders a Deconstruct result as oq's own Deconstruct view does: a
// composed, full-sentence translation, then a per-morpheme row breakdown
// below it (declared/citation spelling + a short, blank-filled gloss) —
// rather than raw morpheme ids in a block stack (bl-oq-ly#4: ids like
// "N_qaq_Vb" mean nothing to a learner). Deliberately plain HTML, not
// Blockly: the read-only case has no drag/snap interaction to justify
// Blockly's overhead, and a flex-wrapping row list is far more usable on a
// small screen than a read-only block stack would be.

import { splitMoodLabel, composedTranslation } from "./gloss.js";

/**
 * @param {HTMLElement} container
 * @param {string} word - the surface form that was analyzed
 * @param {any[]} seq - the winning candidate's seq[] (buildWord-shaped items)
 * @param {{ word: string, approximate: boolean, closed: boolean }} buildResult
 * @param {(seq: any[], opts?: any) => any[]} glossSummaryItems
 * @param {{ reverseOrder?: boolean, lang?: "en"|"da" }} [opts] - bl-oq-ly#11:
 *   `reverseOrder` reads last-morpheme-first in the per-morpheme ROW list
 *   below the translation (e.g. "statement — I" / "to have a" / "dog" for a
 *   word literally ordered dog-have-statement). Never affects the composed
 *   translation line itself, which is a single sentence, not a reversible
 *   list. `lang` (bl-oq-ly#17) selects which of grammarian's published
 *   languages glossSummaryItems resolves each gloss in.
 */
export function renderBreakdown(container, word, seq, buildResult, glossSummaryItems, opts = {}) {
	container.innerHTML = "";

	const heading = document.createElement("div");
	heading.className = "breakdown-word";
	heading.textContent = (buildResult.approximate ? "≈ " : "") + buildResult.word;
	container.appendChild(heading);

	const allItems = glossSummaryItems(seq, { lang: opts.lang });
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
