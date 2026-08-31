// Defines one Blockly block *type* per grammarian morpheme category, all
// snapping only to each other in a single top-to-bottom stack. This is
// deliberate — a Kalaallisut morpheme chain is linear and order-strict (stem
// first, WORD_FINAL-continuation closer last), not a general graph, so
// Blockly's previous/next statement connections (which only ever form a
// single chain per stack) are already the right shape without any extra
// validation code. Real legality of a given *join* (not just the stack
// shape) is still checked live by oq's buildWord(), never by Blockly.
//
// Each morpheme gets its own fixed toolbox flyout entry (id in block.data,
// label pre-set from the catalog) rather than one block type with a giant
// dropdown of every morpheme — a ~2000-option native <select> is both
// mobile-hostile (bl-oq-ly#1) and gives no visual cue about morpheme type,
// which let a non-stem read as a stem in the old single flat list
// (bl-oq-ly#1). One block type per category (not one shared type with a
// per-instance toolbox colour override, which Blockly doesn't actually
// apply — bl-oq-ly#6) gives every block its category's own colour reliably,
// since Blockly always honours setColour() called from a block's own init().

const CONNECTION_TYPE = "MORPHEME_CHAIN";
const BLOCK_TYPE_PREFIX = "morpheme_block__";

// grammarian's lexical_facts.morpheme_type enum (verified against the live
// published catalog — see README's "Morpheme catalog" note). Order here is
// the toolbox category order, roughly composition order (stem first).
const CATEGORY_ORDER = [
	{ key: "stem", wordClass: "N", id: "stem_n", name: "Stems — nouns", colour: 200 },
	{ key: "stem", wordClass: "V", id: "stem_v", name: "Stems — verbs", colour: 210 },
	{ key: "stem", wordClass: "", id: "stem_other", name: "Stems — other", colour: 220 },
	{ key: "derivational_prefix", id: "deriv_prefix", name: "Derivational prefixes", colour: 20 },
	{ key: "derivational_affix", id: "deriv_affix", name: "Derivational affixes", colour: 30 },
	{ key: "inflectional_ending", id: "inflection", name: "Inflectional endings", colour: 130 },
	{ key: "enclitic", id: "enclitic", name: "Enclitics", colour: 290 },
	{ key: "derivational_enclitic", id: "deriv_enclitic", name: "Derivational enclitics", colour: 300 },
	{ key: "sentential_affix", id: "sentential", name: "Sentential affixes", colour: 60 },
	{ key: "particle", id: "particle", name: "Particles", colour: 0 },
];
const FALLBACK_CATEGORY = { key: "other", id: "other", name: "Other", colour: 0 };

function categoryForPreset(preset) {
	const match = CATEGORY_ORDER.find((c) =>
		c.key === preset.morpheme_type && (c.wordClass === undefined || c.wordClass === (preset.word_class || "")));
	return match ?? CATEGORY_ORDER.find((c) => c.key === preset.morpheme_type) ?? FALLBACK_CATEGORY;
}

function blockTypeForCategory(cat) {
	return BLOCK_TYPE_PREFIX + cat.id;
}

function labelFor(preset) {
	const gloss = preset.glossShort || preset.gloss || "(no gloss)";
	return `${preset.id} — ${gloss}`.slice(0, 60);
}

/** Registers one Blockly block type per category, each with that category's own colour. */
export function defineMorphemeBlocks() {
	for (const cat of [...CATEGORY_ORDER, FALLBACK_CATEGORY]) {
		Blockly.Blocks[blockTypeForCategory(cat)] = {
			init() {
				this.appendDummyInput()
					.appendField(new Blockly.FieldLabelSerializable(""), "LABEL");
				this.setPreviousStatement(true, CONNECTION_TYPE);
				this.setNextStatement(true, CONNECTION_TYPE);
				this.setColour(cat.colour);
			},
		};
	}
}

function isMorphemeBlockType(type) {
	return typeof type === "string" && type.startsWith(BLOCK_TYPE_PREFIX);
}

/**
 * Builds a categorized Blockly toolbox from (optionally filtered) presets.
 * A category with no matching presets is omitted entirely, which is what
 * makes the Build-panel filter box (app.js) feel live: typing narrows which
 * categories even appear, not just their contents.
 */
export function buildToolbox(presets) {
	const byCategoryName = new Map();
	for (const preset of presets) {
		const cat = categoryForPreset(preset);
		if (!byCategoryName.has(cat.name)) byCategoryName.set(cat.name, { ...cat, presets: [] });
		byCategoryName.get(cat.name).presets.push(preset);
	}

	const contents = [...CATEGORY_ORDER, FALLBACK_CATEGORY]
		.map((c) => c.name)
		.filter((name, i, arr) => arr.indexOf(name) === i)
		.filter((name) => byCategoryName.has(name))
		.map((name) => {
			const cat = byCategoryName.get(name);
			const blockType = blockTypeForCategory(cat);
			const blocks = cat.presets
				.slice()
				.sort((a, b) => a.id.localeCompare(b.id))
				.map((preset) => ({
					kind: "block",
					type: blockType,
					data: preset.id,
					fields: { LABEL: labelFor(preset) },
				}));
			return {
				kind: "category",
				name: `${cat.name} (${blocks.length})`,
				colour: String(cat.colour),
				contents: blocks,
			};
		});

	return { kind: "categoryToolbox", contents };
}

/** Walks a stack of morpheme blocks starting at `block`, returning morpheme ids top to bottom. */
export function chainFromTopBlock(block) {
	const ids = [];
	let cur = block;
	while (cur) {
		if (isMorphemeBlockType(cur.type) && cur.data) ids.push(cur.data);
		cur = cur.getNextBlock();
	}
	return ids;
}

/** Every top-level (unparented) morpheme-block stack currently on the workspace. */
export function topLevelChains(workspace) {
	return workspace
		.getTopBlocks(true)
		.filter((b) => isMorphemeBlockType(b.type))
		.map((b) => chainFromTopBlock(b));
}

/**
 * Programmatically builds an editable stack of real morpheme blocks for
 * `ids` (stem first) on `workspace`, replacing whatever stack is already
 * there. Used by Deconstruct's "Move to Word Builder" (app.js): the learner
 * gets the verified chain as a live, editable stack to keep experimenting
 * with, not a static read-only display.
 */
export function renderChain(workspace, ids, presetsById) {
	for (const block of workspace.getTopBlocks(false)) block.dispose(false);
	let prev = null;
	for (const id of ids) {
		const preset = presetsById.get(id);
		if (!preset) continue;
		const cat = categoryForPreset(preset);
		const block = workspace.newBlock(blockTypeForCategory(cat));
		block.data = id;
		block.setFieldValue(labelFor(preset), "LABEL");
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
