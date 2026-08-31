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
// Deconstruct pills show.

/**
 * A mood-marking morpheme's own shortGloss bakes its moodLabel ("statement",
 * "question", ...) into the string itself ("statement — I") — real
 * information (this morpheme marks the indicative/declarative mood), just
 * formatted identically to the marker-to-gloss em-dash join everywhere else,
 * which read as one more undifferentiated translation fragment rather than
 * a distinct grammatical category (bl-oq-ly#12). Split it back out so it can
 * render as its own small tag instead.
 */
function splitMoodLabel(item) {
	const gloss = item.shortGloss || item.gloss || item.meaning || "(no gloss)";
	if (item.moodLabel && gloss.startsWith(`${item.moodLabel} — `)) {
		return { moodLabel: item.moodLabel, rest: gloss.slice(item.moodLabel.length + 3) };
	}
	return { moodLabel: null, rest: gloss };
}

/**
 * @param {HTMLElement} container
 * @param {string} word - the surface form that was analyzed
 * @param {any[]} seq - the winning candidate's seq[] (buildWord-shaped items)
 * @param {{ word: string, approximate: boolean, closed: boolean }} buildResult
 * @param {(seq: any[], opts?: any) => any[]} glossSummaryItems
 * @param {{ reverseOrder?: boolean }} [opts] - bl-oq-ly#11: read last-morpheme-first,
 *   the order a European reader's own translation runs in (e.g. "statement —
 *   I" / "to have a" / "dog" for a word literally ordered dog-have-statement)
 */
export function renderBreakdown(container, word, seq, buildResult, glossSummaryItems, opts = {}) {
	container.innerHTML = "";

	const heading = document.createElement("div");
	heading.className = "breakdown-word";
	heading.textContent = (buildResult.approximate ? "≈ " : "") + buildResult.word;
	container.appendChild(heading);

	let items = glossSummaryItems(seq).filter((item) => item.marker !== "Ø");
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

		const { moodLabel, rest } = splitMoodLabel(item);
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
