// Defines the single Blockly block type the whole app uses: one morpheme,
// snapping only to other morpheme blocks in a single top-to-bottom stack.
// This is deliberate — a Kalaallisut morpheme chain is linear and order-
// strict (stem first, WORD_FINAL-continuation closer last), not a general
// graph, so Blockly's previous/next statement connections (which only ever
// form a single chain per stack) are already the right shape without any
// extra validation code. Real legality of a given *join* (not just the
// stack shape) is still checked live by oq's buildWord(), never by Blockly.
//
// Each morpheme gets its own fixed toolbox flyout entry (id in block.data,
// label pre-set from the catalog) rather than one block type with a giant
// dropdown of every morpheme — a ~2000-option native <select> is both
// mobile-hostile (bl-oq-ly#1) and gives no visual cue about morpheme type,
// which let a non-stem read as a stem in the old single flat list
// (bl-oq-ly#1). Grouping into toolbox categories by morpheme_type, each
// with its own colour, fixes both: a learner can never drag an affix out of
// the "Stems" category because it isn't in it.

const CONNECTION_TYPE = "MORPHEME_CHAIN";

// grammarian's lexical_facts.morpheme_type enum (verified against the live
// published catalog — see README's "Morpheme catalog" note). Order here is
// the toolbox category order, roughly composition order (stem first).
const CATEGORY_ORDER = [
	{ key: "stem", wordClass: "N", name: "Stems — nouns", colour: 200 },
	{ key: "stem", wordClass: "V", name: "Stems — verbs", colour: 210 },
	{ key: "stem", wordClass: "", name: "Stems — other", colour: 220 },
	{ key: "derivational_prefix", name: "Derivational prefixes", colour: 20 },
	{ key: "derivational_affix", name: "Derivational affixes", colour: 30 },
	{ key: "inflectional_ending", name: "Inflectional endings", colour: 130 },
	{ key: "enclitic", name: "Enclitics", colour: 290 },
	{ key: "derivational_enclitic", name: "Derivational enclitics", colour: 300 },
	{ key: "sentential_affix", name: "Sentential affixes", colour: 60 },
	{ key: "particle", name: "Particles", colour: 0 },
];

function labelFor(preset) {
	const gloss = preset.glossShort || preset.gloss || "(no gloss)";
	return `${preset.id} — ${gloss}`.slice(0, 60);
}

/** @param {any[]} presets - from catalog.js's loadCatalog() */
export function defineMorphemeBlock() {
	Blockly.Blocks["morpheme_block"] = {
		init() {
			this.appendDummyInput()
				.appendField(new Blockly.FieldLabelSerializable(""), "LABEL");
			this.setPreviousStatement(true, CONNECTION_TYPE);
			this.setNextStatement(true, CONNECTION_TYPE);
			this.setColour(180);
		},
	};
}

/** Builds a categorized Blockly toolbox from the loaded catalog. */
export function buildToolbox(presets) {
	const byCategory = new Map();
	for (const preset of presets) {
		const match = CATEGORY_ORDER.find((c) =>
			c.key === preset.morpheme_type && (c.wordClass === undefined || c.wordClass === (preset.word_class || "")));
		const cat = match ?? CATEGORY_ORDER.find((c) => c.key === preset.morpheme_type) ?? {
			key: "other", name: "Other", colour: 0,
		};
		if (!byCategory.has(cat.name)) byCategory.set(cat.name, { ...cat, presets: [] });
		byCategory.get(cat.name).presets.push(preset);
	}

	const contents = CATEGORY_ORDER
		.map((c) => c.name)
		.filter((name, i, arr) => arr.indexOf(name) === i)
		.filter((name) => byCategory.has(name))
		.map((name) => {
			const cat = byCategory.get(name);
			const blocks = cat.presets
				.slice()
				.sort((a, b) => a.id.localeCompare(b.id))
				.map((preset) => ({
					kind: "block",
					type: "morpheme_block",
					colour: String(cat.colour),
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

/** Walks a stack of morpheme_block starting at `block`, returning morpheme ids top to bottom. */
export function chainFromTopBlock(block) {
	const ids = [];
	let cur = block;
	while (cur) {
		if (cur.type === "morpheme_block" && cur.data) ids.push(cur.data);
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
