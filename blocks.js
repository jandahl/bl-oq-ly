// Defines the single Blockly block type the whole app uses: one morpheme,
// snapping only to other morpheme blocks in a single top-to-bottom stack.
// This is deliberate — a Kalaallisut morpheme chain is linear and order-
// strict (stem first, WORD_FINAL-continuation closer last), not a general
// graph, so Blockly's previous/next statement connections (which only ever
// form a single chain per stack) are already the right shape without any
// extra validation code.

const CONNECTION_TYPE = "MORPHEME_CHAIN";

/**
 * @param {any[]} presets - from catalog.js's loadCatalog(), used only to
 *   build the dropdown's option list (id + short gloss).
 */
export function defineMorphemeBlock(presets) {
	const options = presets
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((p) => [`${p.id} — ${p.glossShort || p.gloss || "(no gloss)"}`.slice(0, 80), p.id]);

	if (options.length === 0) {
		options.push(["(no morphemes loaded)", ""]);
	}

	Blockly.Blocks["morpheme_block"] = {
		init() {
			this.appendDummyInput()
				.appendField(new Blockly.FieldDropdown(options), "MORPHEME_ID");
			this.setPreviousStatement(true, CONNECTION_TYPE);
			this.setNextStatement(true, CONNECTION_TYPE);
			this.setColour(180);
			this.setTooltip("A single morpheme. Snap these into a stack, stem first.");
		},
	};
}

/** Walks a stack of morpheme_block starting at `block`, returning morpheme ids top to bottom. */
export function chainFromTopBlock(block) {
	const ids = [];
	let cur = block;
	while (cur) {
		if (cur.type === "morpheme_block") ids.push(cur.getFieldValue("MORPHEME_ID"));
		cur = cur.getNextBlock();
	}
	return ids;
}

/** Every top-level (unparented) morpheme_block stack currently on the workspace. */
export function topLevelChains(workspace) {
	return workspace
		.getTopBlocks(true)
		.filter((b) => b.type === "morpheme_block")
		.map((b) => chainFromTopBlock(b));
}

/**
 * Renders `ids` (morpheme ids, stem first) as a fresh, read-only stack on
 * `workspace`, replacing whatever was there. Used by Deconstruct mode to
 * show a verified rebuild as blocks rather than a plain list.
 */
export function renderReadOnlyChain(workspace, ids) {
	workspace.clear();
	let prev = null;
	for (const id of ids) {
		const block = workspace.newBlock("morpheme_block");
		block.setFieldValue(id, "MORPHEME_ID");
		block.setEditable(false);
		block.setMovable(false);
		block.setDeletable(false);
		block.initSvg();
		block.render();
		if (prev) {
			prev.nextConnection.connect(block.previousConnection);
		} else {
			block.moveBy(20, 20);
		}
		prev = block;
	}
}
