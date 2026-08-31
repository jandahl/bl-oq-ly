// Renders a Deconstruct result as a per-morpheme gloss breakdown, the same
// kind of view oq's own Deconstruct gives — a row per morpheme with its
// declared/citation spelling and a gloss — rather than raw morpheme ids in
// a block stack (bl-oq-ly#4: ids like "N_qaq_Vb" mean nothing to a learner).
// Deliberately plain HTML, not Blockly: the read-only case has no drag/snap
// interaction to justify Blockly's overhead, and a flex-wrapping row list is
// far more usable on a small screen than a read-only block stack.
//
// Uses glossSummary() (the only gloss-joining function on the exported
// public-api.js surface right now — see oq-api.js's comment) rather than the
// shorter, blank-filled shortGloss a newer unreleased oq build carries: each
// string is "marker+text — gloss", parsed back into two columns here. A
// zero/null ending's own marker is the literal string "Ø" with empty text.

/**
 * @param {HTMLElement} container
 * @param {string} word - the surface form that was analyzed
 * @param {any[]} seq - the winning candidate's seq[] (buildWord-shaped items)
 * @param {{ word: string, approximate: boolean, closed: boolean }} buildResult
 * @param {(seq: any[], opts?: any) => string[]} glossSummary
 */
export function renderBreakdown(container, word, seq, buildResult, glossSummary) {
	container.innerHTML = "";

	const heading = document.createElement("div");
	heading.className = "breakdown-word";
	heading.textContent = (buildResult.approximate ? "≈ " : "") + buildResult.word;
	container.appendChild(heading);

	const lines = glossSummary(seq).filter((line) => !line.startsWith("Ø —"));

	const rows = document.createElement("div");
	rows.className = "breakdown-rows";
	for (const line of lines) {
		const sepIndex = line.indexOf(" — ");
		const spellingText = sepIndex === -1 ? line : line.slice(0, sepIndex);
		const glossText = sepIndex === -1 ? "" : line.slice(sepIndex + 3);

		const row = document.createElement("div");
		row.className = "breakdown-row";

		const spelling = document.createElement("span");
		spelling.className = "breakdown-spelling";
		spelling.textContent = spellingText;

		const gloss = document.createElement("span");
		gloss.className = "breakdown-gloss";
		gloss.textContent = glossText;

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
