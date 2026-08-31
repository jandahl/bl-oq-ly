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
//
// Directional connections (bl-oq-ly#11): a stem is always the leftmost
// morpheme, so its block has no previousConnection at all — Blockly simply
// won't let anything snap above it, catching that class of illegal stack at
// drag time instead of only after the fact via buildWord(). Symmetrically,
// a WORD_FINAL-closing morpheme (an ordinary inflectional ending or plain
// enclitic; NOT a derivational_enclitic, which grammarian's own schema
// documents as not sealing the word) has no nextConnection, so nothing can
// snap below it. This only encodes the two structural cases that are always
// true regardless of which specific morpheme is involved; it deliberately
// does not attempt to re-encode morphotactics.js's full join-legality rules
// (continuation_class-vs-continuation_class compatibility, category shifts,
// derivational_prefix's own attachment site) as Blockly connection checks —
// that's real engine logic that belongs in oq, not duplicated here, and
// buildWord() already reports it live once a stack is built.

const CONNECTION_TYPE = "MORPHEME_CHAIN";
const BLOCK_TYPE_PREFIX = "morpheme_block__";

// grammarian's lexical_facts.morpheme_type enum (verified against the live
// published catalog — see README's "Morpheme catalog" note). Order here is
// the toolbox category order, roughly composition order (stem first).
// hasPrevious/hasNext default to true when omitted.
const CATEGORY_ORDER = [
	{ key: "stem", wordClass: "N", id: "stem_n", name: "Stems — nouns", colour: 200, hasPrevious: false },
	{ key: "stem", wordClass: "V", id: "stem_v", name: "Stems — verbs", colour: 210, hasPrevious: false },
	{ key: "stem", wordClass: "", id: "stem_other", name: "Stems — other", colour: 220, hasPrevious: false },
	{ key: "derivational_prefix", id: "deriv_prefix", name: "Derivational prefixes", colour: 20 },
	{ key: "derivational_affix", id: "deriv_affix", name: "Derivational affixes", colour: 30 },
	{ key: "inflectional_ending", id: "inflection", name: "Inflectional endings", colour: 130, hasNext: false },
	{ key: "enclitic", id: "enclitic", name: "Enclitics", colour: 290, hasNext: false },
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

/**
 * The actual Kalaallisut spelling (declared/citation form, with its
 * +/-/± marker) always shows on the block, regardless of `showIds` — that's
 * real language, not "linguist speak", and it's a different thing entirely
 * from grammarian's own internal id (e.g. "N_qaq_Vb", "V_IND_INTR_1SG"),
 * which happens to equal the spelling for a plain stem (its id IS its
 * citation form) but is an opaque code for everything else. `showIds`
 * toggles only that opaque id, on top of the spelling.
 *
 * A mood-marking morpheme's gloss also bakes its own moodLabel ("statement",
 * "question", ...) into the string with the same em-dash join as everything
 * else; unlike Deconstruct's breakdown view (which keeps it as a small
 * separate tag), blocks drop it entirely -- bl-oq-ly#14, there's no room for
 * a second annotation on an already-compact block label.
 *
 * @param {boolean} showIds - bl-oq-ly#10: also show grammarian's internal id
 */
function labelFor(preset, showIds) {
	const spelling = preset.expected || preset.id;
	const moodLabel = preset.plainGloss?.en_mood_label;
	const rawGloss = preset.glossShort || preset.gloss || "(no gloss)";
	const gloss = moodLabel && rawGloss.startsWith(`${moodLabel} — `) ? rawGloss.slice(moodLabel.length + 3) : rawGloss;
	const label = showIds ? `${preset.id} — ${spelling} — ${gloss}` : `${spelling} — ${gloss}`;
	return label.slice(0, 60);
}

/** Registers one Blockly block type per category, each with that category's own colour and connection shape. */
export function defineMorphemeBlocks() {
	for (const cat of [...CATEGORY_ORDER, FALLBACK_CATEGORY]) {
		Blockly.Blocks[blockTypeForCategory(cat)] = {
			init() {
				this.appendDummyInput()
					.appendField(new Blockly.FieldLabelSerializable(""), "LABEL");
				this.setPreviousStatement(cat.hasPrevious !== false, CONNECTION_TYPE);
				this.setNextStatement(cat.hasNext !== false, CONNECTION_TYPE);
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
export function buildToolbox(presets, showIds) {
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
					fields: { LABEL: labelFor(preset, showIds) },
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
 * with, not a static read-only display. Always lays out stem-first — see
 * app.js's own comment on why "read last-morpheme-first" doesn't flip the
 * physical block stack, only Deconstruct's row order and Build's separate
 * reading-order line.
 */
export function renderChain(workspace, ids, presetsById, showIds) {
	for (const block of workspace.getTopBlocks(false)) block.dispose(false);
	let prev = null;
	for (const id of ids) {
		const preset = presetsById.get(id);
		if (!preset) continue;
		const cat = categoryForPreset(preset);
		const block = workspace.newBlock(blockTypeForCategory(cat));
		block.data = id;
		block.setFieldValue(labelFor(preset, showIds), "LABEL");
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

/** Re-labels every morpheme block already on the canvas — used when the "show ids" toggle changes mid-session. */
export function relabelBlocks(workspace, presetsById, showIds) {
	for (const block of workspace.getAllBlocks(false)) {
		if (!isMorphemeBlockType(block.type) || !block.data) continue;
		const preset = presetsById.get(block.data);
		if (preset) block.setFieldValue(labelFor(preset, showIds), "LABEL");
	}
}
