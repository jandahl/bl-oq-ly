// Renders a Deconstruct result as a per-morpheme gloss breakdown, the same
// kind of view oq's own Deconstruct gives — a row per morpheme with its
// declared/citation spelling and a short, blank-filled gloss — rather than
// raw morpheme ids in a block stack (bl-oq-ly#4: ids like "N_qaq_Vb" mean
// nothing to a learner). Deliberately plain HTML, not Blockly: the read-only
// case has no drag/snap interaction to justify Blockly's overhead, and a
// flex-wrapping row list is far more usable on a small screen than a
// read-only block stack would be.
//
// Uses glossSummaryItems() for its short, blank-filled `shortGloss` per
// morpheme (e.g. "to have a(n) ___") — the same kind of phrasing oq's own
// Deconstruct pills show — rather than the plainer, string-joining
// glossSummary(). Only available now that oq-api.js points at a deployment
// where glossSummaryItems is on the exported public-api.js surface; see
// oq-api.js's own comment.

/**
 * @param {HTMLElement} container
 * @param {string} word - the surface form that was analyzed
 * @param {any[]} seq - the winning candidate's seq[] (buildWord-shaped items)
 * @param {{ word: string, approximate: boolean, closed: boolean }} buildResult
 * @param {(seq: any[], opts?: any) => any[]} glossSummaryItems
 */
export function renderBreakdown(container, word, seq, buildResult, glossSummaryItems) {
	container.innerHTML = "";

	const heading = document.createElement("div");
	heading.className = "breakdown-word";
	heading.textContent = (buildResult.approximate ? "≈ " : "") + buildResult.word;
	container.appendChild(heading);

	const items = glossSummaryItems(seq).filter((item) => item.marker !== "Ø");

	const rows = document.createElement("div");
	rows.className = "breakdown-rows";
	for (const item of items) {
		const row = document.createElement("div");
		row.className = "breakdown-row";

		const spelling = document.createElement("span");
		spelling.className = "breakdown-spelling";
		spelling.textContent = `${item.marker}${item.text}`;

		const gloss = document.createElement("span");
		gloss.className = "breakdown-gloss";
		gloss.textContent = item.shortGloss || item.gloss || item.meaning || "(no gloss)";

		row.append(spelling, gloss);
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
