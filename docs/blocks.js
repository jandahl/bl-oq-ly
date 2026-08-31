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
// Directional connections (bl-oq-ly#11, corrected bl-oq-ly#15): encodes the
// subset of oq's real join-legality engine (morphotactics.js's canFollow())
// that's always true regardless of which specific morpheme is involved,
// structurally, via Blockly's own connection system:
//   - a stem is always the leftmost morpheme (canFollow: "a stem can only
//     begin a word") -- no previousConnection at all.
//   - a particle is a free-standing word: it can only be the SOLE item of a
//     sequence, nothing may precede or follow it, not even another particle
//     -- no previousConnection AND no nextConnection.
//   - a plain enclitic always seals the word once attached (nothing but
//     another enclitic-family morpheme could follow, and Blockly's static
//     per-category check strings can't express "only these specific
//     categories," so this is drawn conservatively at "nothing") -- no
//     nextConnection.
// An ordinary WORD_FINAL inflectional ending does NOT get this treatment
// (an earlier version of this file wrongly disabled its nextConnection too)
// -- morphotactics.js's CLOSED_BYPASS_TYPES explicitly allows an enclitic or
// derivational_enclitic to attach onto an already-closed word, e.g. a
// finite verb ending followed by an enclitic, a real and common
// construction. A derivational_enclitic keeps both connections for the same
// reason it's exempt from CLOSED_BYPASS_TYPES's usual sealing: grammarian's
// own schema documents it as NOT closing the word, so further affixes/
// endings can still follow.
//
// What this deliberately does NOT encode: category_shift's N/V typed pipe
// (a derivational affix's input class must match the running word's current
// class, and its output class becomes the new running class), or the
// separate valency-scale compatibility checks (semanticCompatibility()).
// Both are real, well-structured rules -- worth a proper typed-connector
// treatment (Blockly connection `check` arrays keyed on N/V, rather than
// the single shared "MORPHEME_CHAIN" string every category uses today) if
// this ever becomes a second pass, but that's a materially bigger change:
// the check would need to be per-PRESET (derived from that preset's own
// category_shift), not per-CATEGORY like everything here, since e.g.
// "Derivational affixes" mixes N->V, V->N, N->N, and V->V entries. Until
// then, buildWord() reports the wrong-word-class case live once a stack is
// built, same as any other join-legality rejection.

import { buildVerbEndingIndex, candidatesFor, parsePersonNumber, personNumberLabel, moodDisplayLabel } from "./verb-endings.js";

const CONNECTION_TYPE = "MORPHEME_CHAIN";
const BLOCK_TYPE_PREFIX = "morpheme_block__";
const VERB_ENDING_PICKER_TYPE = `${BLOCK_TYPE_PREFIX}verb_ending_picker`;

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
	{ key: "inflectional_ending", id: "inflection", name: "Inflectional endings", colour: 130 },
	{ key: "enclitic", id: "enclitic", name: "Enclitics", colour: 290, hasNext: false },
	{ key: "derivational_enclitic", id: "deriv_enclitic", name: "Derivational enclitics", colour: 300 },
	{ key: "sentential_affix", id: "sentential", name: "Sentential affixes", colour: 60 },
	{ key: "particle", id: "particle", name: "Particles", colour: 0, hasPrevious: false, hasNext: false },
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
 * +/-/± marker) always shows on the block by default — that's real
 * language, not "linguist speak", and it's a different thing entirely from
 * grammarian's own internal id (e.g. "N_qaq_Vb", "V_IND_INTR_1SG"), which
 * happens to equal the spelling for a plain stem (its id IS its citation
 * form) but is an opaque code for everything else. `opts.spellingMode` can
 * hide it (or hide the gloss instead) for a learner who wants to test their
 * own recall in one direction; `opts.showIds` toggles the opaque internal id
 * on top of whichever of those is showing.
 *
 * A mood-marking morpheme's gloss also bakes its own moodLabel ("statement",
 * "question", ...) into the string with the same em-dash join as everything
 * else; unlike Deconstruct's breakdown view (which keeps it as a small
 * separate tag), blocks drop it entirely -- bl-oq-ly#14, there's no room for
 * a second annotation on an already-compact block label.
 *
 * @param {any} preset
 * @param {{ showIds?: boolean, lang?: "en"|"da", spellingMode?: "both"|"spelling-only"|"gloss-only" }} [opts]
 *   bl-oq-ly#10 (showIds), #17 (lang, spellingMode)
 */
// grammarian's own CLAUDE.md: "en_short and da_short may be legacy strings
// or context maps keyed by English/Danish realization contexts such as
// default, third_singular, and gerund; typed placeholders such as
// {{verb:3sg}} inflect the head verb of a composed phrase." A toolbox
// label works from a bare preset, not a built sequence, so there's no real
// realization context to pick here (unlike glossSummaryItems, which
// resolves this properly against the actual sequence being built) -- this
// always takes the map's own "default" entry, a reasonable citation-form
// stand-in, same as showing a stem's bare dictionary form.
function plainStringGloss(value) {
	if (typeof value === "string") return value;
	if (value && typeof value === "object") return value.default ?? Object.values(value)[0];
	return undefined;
}

export function labelFor(preset, opts = {}) {
	const { showIds = false, lang = "en", spellingMode = "both" } = opts;
	const spelling = preset.expected || preset.id;
	const moodLabel = preset.plainGloss?.[`${lang}_mood_label`];
	// Danish glosses aren't populated on every entry yet (grammarian's own
	// rollout is ongoing) — fall back to English rather than show nothing.
	const rawGloss = plainStringGloss(preset.plainGloss?.[`${lang}_short`])
		?? (lang === "da" ? plainStringGloss(preset.plainGloss?.da) : null)
		?? preset.glossShort ?? preset.gloss ?? "(no gloss)";
	const gloss = moodLabel && rawGloss.startsWith(`${moodLabel} — `) ? rawGloss.slice(moodLabel.length + 3) : rawGloss;

	const core = spellingMode === "spelling-only" ? spelling
		: spellingMode === "gloss-only" ? gloss
			: `${spelling} — ${gloss}`;
	const label = showIds ? `${preset.id} — ${core}` : core;
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

// ---------------------------------------------------------------------------
// Verb ending picker (bl-oq-ly#18) — a conjugation-style block, the same
// paradigm shape as oq's own conjugation modal, replacing a flat scroll
// through ~278 individual mood-ending entries with four small dropdowns
// (mood, transitivity, subject person, subject number — plus object
// person/number when transitive). This is the standard Blockly pattern for
// a categorical choice — the same `FieldDropdown` core Blockly's own
// math_single block uses for "√ / abs / -x / ln / ..." — not a custom field
// and not a mutator (mutators are for variable-ARITY structure like
// if/elseif/else; a verb's paradigm coordinates are a fixed small set of
// axes, which is exactly what plain dropdown fields are for).
//
// 23 of those 278 endings collide on identical paradigm coordinates (e.g.
// plain vs. negative contemporative) -- ./verb-endings.js's candidatesFor()
// surfaces every match for a given combination; when there's more than one,
// a fifth "variant" dropdown appears, built fresh from that combination's
// real candidates via a per-instance FieldDropdown menu generator (never a
// module-level shared list -- multiple picker blocks can be on the canvas
// at once with different combinations selected).
//
// Down to four real dropdowns (mood, transitivity, subject, object) rather
// than the six a naive one-axis-per-field layout would need: subject
// person+number and object person+number are each a single combined choice
// ("I" / "you" / "he, she, it" / ...), the same "Subject"/"Object" pattern
// oq's own conjugation modal uses instead of separate person and number
// pickers (bl-oq-ly#18 follow-up). Mood/person labels come from oq's own
// resolveMoodLabel()/resolvePersonLabel() (oq#881) -- plain-language by
// default, e.g. "statement" rather than "indicative" -- not a bespoke
// grammar-terms vocabulary a non-linguist learner wouldn't know.
const TRANSITIVITY_LABEL = { intransitive: "no object", transitive: "with an object" };

function verbEndingPickerFields(verbEndingIndex, resolveMoodLabel, resolvePersonLabel) {
	const moodOptions = verbEndingIndex.moods.map((m) => [moodDisplayLabel(m, resolveMoodLabel), m]);
	const transOptions = verbEndingIndex.transitivities.map((t) => [TRANSITIVITY_LABEL[t] ?? t, t]);
	const subjectOptions = verbEndingIndex.subjectCombos.map((c) => [personNumberLabel(c, resolvePersonLabel), c]);
	const objectOptions = verbEndingIndex.objectCombos.map((c) => [personNumberLabel(c, resolvePersonLabel), c]);
	return { moodOptions, transOptions, subjectOptions, objectOptions };
}

/**
 * Recomputes which real morpheme id the picker's current field selections
 * resolve to, and updates the block's visible state (object fields shown
 * only when transitive, variant dropdown shown only when the combination is
 * ambiguous, RESOLVED label showing the real Kalaallisut spelling+gloss).
 *
 * `overrides` carries the field that's *in the middle of changing* -- called
 * from a field validator, which Blockly invokes with the prospective new
 * value BEFORE it's committed to the field itself, so `block.getFieldValue()`
 * for that one field would still read the OLD value if this didn't take an
 * explicit override for it. Every other field's value is already committed
 * and safe to read normally.
 */
function resolveVerbPicker(block, verbEndingIndex, presetsById, getDisplayOptions, overrides = {}) {
	const fieldValue = (name) => overrides[name] ?? block.getFieldValue(name);
	const mood = fieldValue("MOOD");
	const transitivity = fieldValue("TRANS");
	const { person: sPerson, number: sNumber } = parsePersonNumber(fieldValue("SUBJECT"));
	const isTransitive = transitivity === "transitive";

	const objInput = block.getInput("OBJ");
	if (objInput) objInput.setVisible(isTransitive);

	const { person: oPerson, number: oNumber } = isTransitive
		? parsePersonNumber(fieldValue("OBJECT"))
		: { person: undefined, number: undefined };

	const candidates = candidatesFor(verbEndingIndex, mood, transitivity, sPerson, sNumber, oPerson, oNumber);
	const variantInput = block.getInput("VARIANT_GROUP");
	const variantField = block.getField("VARIANT");

	let resolvedId = null;
	if (candidates.length === 1) {
		resolvedId = candidates[0].id;
		if (variantInput) variantInput.setVisible(false);
	} else if (candidates.length > 1) {
		block.verbPickerState = { candidateOptions: candidates.map((c) => [c.label.slice(0, 70), c.id]) };
		if (variantInput) variantInput.setVisible(true);
		const currentValue = overrides.VARIANT ?? variantField?.getValue();
		const stillValid = candidates.some((c) => c.id === currentValue);
		resolvedId = stillValid ? currentValue : candidates[0].id;
		// Only re-point the field at a new default when the *previous*
		// combination's variant no longer applies -- never overwrite a
		// value this exact call is already in the middle of committing
		// (that's `overrides.VARIANT`, already valid by construction).
		if (!stillValid && variantField && overrides.VARIANT === undefined) variantField.setValue(resolvedId);
	} else {
		if (variantInput) variantInput.setVisible(false);
	}

	block.data = resolvedId;
	const resolvedField = block.getField("RESOLVED");
	if (resolvedField) {
		const preset = resolvedId ? presetsById.get(resolvedId) : null;
		resolvedField.setValue(preset ? labelFor(preset, getDisplayOptions()) : "(no such ending in the catalog)");
	}
	// init()'s own initial call runs before initSvg()/render() ever have --
	// nothing to re-render yet at that point, and calling render() early
	// throws.
	if (block.rendered) block.render();
}

/**
 * Registers the verb ending picker block type. Call once, after the catalog
 * (and therefore verbEndingIndex) is available.
 * @param {ReturnType<typeof buildVerbEndingIndex>} verbEndingIndex
 * @param {Map<string, any>} presetsById
 * @param {() => object} getDisplayOptions - reads current live display
 *   options (app.js's showIds/lang/spellingMode) each time the block's
 *   resolved-spelling field needs to re-render, so it always reflects
 *   whatever the learner has currently toggled, same as relabelBlocks()
 *   does for ordinary blocks.
 * @param {(mood: string) => { text: string, title: string|null }} resolveMoodLabel
 *   oq's public-api export (oq#881) -- see verb-endings.js's header comment
 *   on why it's passed in here rather than imported directly.
 * @param {(person: number, number: string) => string} resolvePersonLabel oq's public-api export.
 */
export function defineVerbEndingPickerBlock(verbEndingIndex, presetsById, getDisplayOptions, resolveMoodLabel, resolvePersonLabel) {
	const { moodOptions, transOptions, subjectOptions, objectOptions } = verbEndingPickerFields(verbEndingIndex, resolveMoodLabel, resolvePersonLabel);

	// A field validator (not Block.setOnChange -- empirically unreliable for
	// this in testing: it never fired at all for a plain workspace.newBlock()
	// + setFieldValue() sequence, only a real user drag) is Blockly's
	// standard, synchronously-guaranteed hook for "a field's value is about
	// to change." Every dropdown but VARIANT shares this one: resolve with
	// the field's own prospective new value as an override (see
	// resolveVerbPicker's own comment on why), then accept it unchanged.
	function onFieldChange(fieldName) {
		return function (newValue) {
			const block = this.getSourceBlock();
			if (block) resolveVerbPicker(block, verbEndingIndex, presetsById, getDisplayOptions, { [fieldName]: newValue });
			return newValue;
		};
	}

	Blockly.Blocks[VERB_ENDING_PICKER_TYPE] = {
		init() {
			this.verbPickerState = { candidateOptions: [["—", "NONE"]] };

			this.appendDummyInput()
				.appendField("Verb ending:")
				.appendField(new Blockly.FieldDropdown(moodOptions, onFieldChange("MOOD")), "MOOD")
				.appendField(new Blockly.FieldDropdown(transOptions, onFieldChange("TRANS")), "TRANS");
			this.appendDummyInput()
				.appendField("subject")
				.appendField(new Blockly.FieldDropdown(subjectOptions, onFieldChange("SUBJECT")), "SUBJECT");
			this.appendDummyInput("OBJ")
				.appendField("object")
				.appendField(new Blockly.FieldDropdown(objectOptions, onFieldChange("OBJECT")), "OBJECT");
			this.appendDummyInput("VARIANT_GROUP")
				.appendField("variant")
				.appendField(new Blockly.FieldDropdown(function () {
					// `this` is the FieldDropdown instance here (called as
					// `this.menuGenerator_()` inside Blockly's own getOptions()),
					// NOT the block or module scope -- an arrow function here
					// would silently break this. Per-instance state lives on the
					// owning block, never a module-level shared list, since
					// multiple picker blocks can each have a different
					// combination (and so a different variant list) selected
					// at once.
					return this.getSourceBlock()?.verbPickerState?.candidateOptions ?? [["—", "NONE"]];
				}, onFieldChange("VARIANT")), "VARIANT");
			this.appendDummyInput()
				.appendField(new Blockly.FieldLabelSerializable(""), "RESOLVED");

			this.setPreviousStatement(true, CONNECTION_TYPE);
			this.setNextStatement(true, CONNECTION_TYPE);
			this.setColour(130); // matches "Inflectional endings"' own category colour
			this.setInputsInline(false);
			// Fields start on their first option, which needs an initial
			// resolve too -- a validator only fires on a *change*, and the
			// block's very first render never triggers one.
			resolveVerbPicker(this, verbEndingIndex, presetsById, getDisplayOptions);
		},
	};

	Blockly.Blocks[VERB_ENDING_PICKER_TYPE].__resolve = (block) =>
		resolveVerbPicker(block, verbEndingIndex, presetsById, getDisplayOptions);
}

export { VERB_ENDING_PICKER_TYPE };

/**
 * Builds a categorized Blockly toolbox from (optionally filtered) presets.
 * A category with no matching presets is omitted entirely, which is what
 * makes the Build-panel filter box (app.js) feel live: typing narrows which
 * categories even appear, not just their contents. The verb ending picker
 * (bl-oq-ly#18) replaces every individual mood-ending entry in "Inflectional
 * endings" with one picker block at the top of that category; the ~77
 * remaining non-paradigm entries (case/possession endings with no
 * `inflection` block) still list individually, same as any other category.
 *
 * The picker has no id/gloss text of its own to match against a filter
 * query, so it only appears in the unfiltered view (`includeVerbPicker`,
 * true by default) -- app.js passes false while a filter is active, so
 * searching for something unrelated doesn't leave a near-empty
 * "Inflectional endings (1)" category cluttering the results.
 */
export function buildToolbox(presets, displayOptions = {}, { includeVerbPicker = true } = {}) {
	const byCategoryName = new Map();
	for (const preset of presets) {
		if (preset.morpheme_type === "inflectional_ending" && preset.seq?.[0]?.inflection?.subject) continue;
		const cat = categoryForPreset(preset);
		if (!byCategoryName.has(cat.name)) byCategoryName.set(cat.name, { ...cat, presets: [] });
		byCategoryName.get(cat.name).presets.push(preset);
	}

	const contents = [...CATEGORY_ORDER, FALLBACK_CATEGORY]
		.map((c) => c.name)
		.filter((name, i, arr) => arr.indexOf(name) === i)
		.filter((name) => byCategoryName.has(name) || (includeVerbPicker && name === "Inflectional endings"))
		.map((name) => {
			const cat = byCategoryName.get(name) ?? { ...CATEGORY_ORDER.find((c) => c.name === name), presets: [] };
			const blockType = blockTypeForCategory(cat);
			const blocks = cat.presets
				.slice()
				.sort((a, b) => a.id.localeCompare(b.id))
				.map((preset) => ({
					kind: "block",
					type: blockType,
					data: preset.id,
					fields: { LABEL: labelFor(preset, displayOptions) },
				}));
			if (name === "Inflectional endings" && includeVerbPicker) blocks.unshift({ kind: "block", type: VERB_ENDING_PICKER_TYPE });
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
 * reading-order line. Uses the plain per-category block type even for a
 * verb ending (never the picker widget) — the picker is a toolbox authoring
 * convenience, not the canonical on-canvas representation of an id.
 */
export function renderChain(workspace, ids, presetsById, displayOptions) {
	for (const block of workspace.getTopBlocks(false)) block.dispose(false);
	let prev = null;
	for (const id of ids) {
		const preset = presetsById.get(id);
		if (!preset) continue;
		const cat = categoryForPreset(preset);
		const block = workspace.newBlock(blockTypeForCategory(cat));
		block.data = id;
		block.setFieldValue(labelFor(preset, displayOptions), "LABEL");
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

/** Re-labels every morpheme block already on the canvas — used when a display option changes mid-session. */
export function relabelBlocks(workspace, presetsById, displayOptions) {
	for (const block of workspace.getAllBlocks(false)) {
		if (block.type === VERB_ENDING_PICKER_TYPE) {
			Blockly.Blocks[VERB_ENDING_PICKER_TYPE].__resolve(block);
			continue;
		}
		if (!isMorphemeBlockType(block.type) || !block.data) continue;
		const preset = presetsById.get(block.data);
		if (preset) block.setFieldValue(labelFor(preset, displayOptions), "LABEL");
	}
}

export { buildVerbEndingIndex };
