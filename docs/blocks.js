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
// since Blockly always honours setStyle() called from a block's own init().
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
const VERB_MOOD_TYPE = `${BLOCK_TYPE_PREFIX}verb_mood`;
const VERB_SUBJECT_TYPE = `${BLOCK_TYPE_PREFIX}verb_subject`;
const VERB_OBJECT_TYPE = `${BLOCK_TYPE_PREFIX}verb_object`;
// Value-connection check type for the picker's object socket -- distinct
// from CONNECTION_TYPE (a previous/next STATEMENT connection every ordinary
// morpheme block uses) since this is a sideways value/output connection
// with no place in the linear stem-to-ending stack; a VERB_OBJECT_TYPE block
// can only ever plug into a picker's OBJECT_SLOT input, never the main chain.
const VERB_OBJECT_CONNECTION_TYPE = "VERB_OBJECT";
const VERB_MOOD_CONNECTION_TYPE = "VERB_MOOD";
const VERB_SUBJECT_CONNECTION_TYPE = "VERB_SUBJECT";
const INFLECTION_BLOCK_STYLE = "oq_inflectional_blocks";

// grammarian's lexical_facts.morpheme_type enum (verified against the live
// published catalog — see README's "Morpheme catalog" note). Order here is
// the toolbox category order, roughly composition order (stem first).
// hasPrevious/hasNext default to true when omitted.
const CATEGORY_ORDER = [
	{ key: "stem", wordClass: "N", id: "stem_n", name: "Stems — nouns", colourClass: "oq_nominal", hasPrevious: false },
	{ key: "stem", wordClass: "V", id: "stem_v", name: "Stems — verbs", colourClass: "oq_verbal", hasPrevious: false },
	{ key: "stem", wordClass: "", id: "stem_other", name: "Stems — other", colourClass: "oq_neutral", hasPrevious: false },
	{ key: "derivational_prefix", id: "deriv_prefix", name: "Derivational prefixes", colourClass: "oq_derivational" },
	{ key: "derivational_affix", id: "deriv_affix", name: "Derivational affixes", colourClass: "oq_derivational" },
	{ key: "inflectional_ending", id: "inflection", name: "Inflectional endings", colourClass: "oq_inflectional" },
	{ key: "enclitic", id: "enclitic", name: "Enclitics", colourClass: "oq_enclitic", hasNext: false },
	{ key: "derivational_enclitic", id: "deriv_enclitic", name: "Derivational enclitics", colourClass: "oq_enclitic" },
	{ key: "sentential_affix", id: "sentential", name: "Sentential affixes", colourClass: "oq_inflectional" },
	{ key: "particle", id: "particle", name: "Particles", colourClass: "oq_neutral", hasPrevious: false, hasNext: false },
];
const FALLBACK_CATEGORY = { key: "other", id: "other", name: "Other", colourClass: "oq_neutral" };

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
	// The morpheme is the useful learner-facing identity, so keep its form at
	// the start of the label whenever spellingMode includes it. Internal API
	// ids are optional diagnostics and belong at the end; putting them first
	// lets Blockly's compact-label truncation hide the actual Kalaallisut form
	// behind an opaque code.
	const maxLength = 60;
	if (!showIds) return core.slice(0, maxLength);
	const suffix = ` — ${preset.id}`;
	const available = maxLength - suffix.length;
	if (available <= 1) return `${spelling}${suffix}`.slice(0, maxLength);
	const visibleCore = core.length > available ? `${core.slice(0, available - 1)}…` : core;
	return `${visibleCore}${suffix}`;
}

/**
 * Whether a catalog preset matches the Build-palette query. Search the same
 * learner-facing surface data the block can display, not only oq's internal
 * id and English gloss. In particular, the ordinary negator is spelled
 * `-nngit` but has the API id `V_ngngit_Vb`; an id-only search silently hid
 * the exact morpheme a learner typed.
 *
 * @param {any} preset
 * @param {string} query
 */
export function presetMatchesQuery(preset, query) {
	const q = String(query ?? "").trim().toLowerCase();
	if (!q) return true;
	const plainGloss = preset?.plainGloss ?? {};
	const searchable = [
		preset?.id,
		preset?.expected,
		...(Array.isArray(preset?.searchForms) ? preset.searchForms : []),
		preset?.glossShort,
		preset?.gloss,
		plainStringGloss(plainGloss.en_short),
		plainGloss.en,
		plainStringGloss(plainGloss.da_short),
		plainGloss.da,
	];
	return searchable.some((value) => typeof value === "string" && value.toLowerCase().includes(q));
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
				this.setStyle(`${cat.colourClass}_blocks`);
			},
		};
	}
}

function isMorphemeBlockType(type) {
	// VERB_OBJECT_TYPE shares this module's block-type prefix (it's still a
	// morpheme-adjacent block) but is never itself a chain link -- it's a
	// value block that only ever plugs sideways into a picker's OBJECT_SLOT.
	// Left unplugged and sitting loose on the canvas, it would otherwise
	// register as its own (empty) top-level "chain" in topLevelChains(),
	// wrongly tripping refreshBuild()'s "more than one stack" error even
	// though there's only one real stem-to-ending stack on the workspace.
	return typeof type === "string" && type.startsWith(BLOCK_TYPE_PREFIX)
		&& ![VERB_MOOD_TYPE, VERB_SUBJECT_TYPE, VERB_OBJECT_TYPE].includes(type);
}

// ---------------------------------------------------------------------------
// Verb ending picker (bl-oq-ly#18, object-as-plug-in bl-oq-ly#20 follow-up)
// — a conjugation-style block, the same paradigm shape as oq's own
// conjugation modal, replacing a flat scroll through ~278 individual
// mood-ending entries. Mood, polarity, and subject are explicit fields on
// the ending itself; object remains an optional typed value socket because
// it changes valency and has its own meaningful block structure.
//
// Transitivity is no longer its own dropdown: it's DERIVED from whether a
// VERB_OBJECT_TYPE block is plugged into the picker's OBJECT_SLOT value
// input -- a real, typed (VERB_OBJECT_CONNECTION_TYPE) puzzle-piece
// connection, dangling/optional the same way a math block's operand socket
// can sit empty. This is the idiomatic Blockly mechanism for "an optional
// value that also carries its own choice" (here: which object), rather than
// a yes/no dropdown plus a second, conditionally-visible dropdown -- a real
// user drag-connecting/disconnecting the object block IS the "with/without
// an object" choice. registerVerbPickerReactivity() (below) is what makes
// the picker re-resolve when that connection (or the connected object
// block's own dropdown) changes, since a field validator can only observe
// changes to the picker's OWN fields, not a plugged-in block's.
//
// 23 of those 278 endings collide on identical paradigm coordinates (e.g.
// plain vs. negative contemporative) -- ./verb-endings.js's candidatesFor()
// surfaces every match for a given combination; when there's more than one,
// a "variant" dropdown appears, built fresh from that combination's real
// candidates via a per-instance FieldDropdown menu generator (never a
// module-level shared list -- multiple picker blocks can be on the canvas
// at once with different combinations selected).
//
// Subject and object are each a single combined choice ("I" / "you" /
// "he, she, it" / ...), the same "Subject"/"Object" pattern oq's own
// conjugation modal uses instead of separate person and number pickers.
// Mood/person labels come from oq's own resolveMoodLabel()/
// resolvePersonLabel() (oq#881) -- plain-language by default, e.g.
// "statement" rather than "indicative" -- not a bespoke grammar-terms
// vocabulary a non-linguist learner wouldn't know.

function verbEndingPickerFields(verbEndingIndex, resolveMoodLabel, resolvePersonLabel) {
	const moodOptions = verbEndingIndex.moods.map((m) => [moodDisplayLabel(m, resolveMoodLabel), m]);
	const subjectOptions = verbEndingIndex.subjectCombos.map((c) => [personNumberLabel(c, resolvePersonLabel), c]);
	const polarityOptions = [["affirmative", "positive"], ["negative", "negative"]];
	const polarityMapping = Object.fromEntries(verbEndingIndex.moods.map((mood) => [
		mood,
		(verbEndingIndex.polaritiesByMood.get(mood) ?? ["positive"]).map((polarity) => [
			polarity === "negative" ? "negative" : "affirmative", polarity,
		]),
	]));
	return { moodOptions, subjectOptions, polarityOptions, polarityMapping };
}

/**
 * Recomputes which real morpheme id the picker's grammatical controls
 * resolve to, and updates the
 * block's visible state (variant dropdown shown only when the combination is
 * ambiguous, RESOLVED label showing the real Kalaallisut spelling+gloss).
 *
 * `variantOverride` carries the parent block's one remaining field while it
 * is in the middle of changing. Mood, polarity, and subject are fields on
 * the parent; object is a typed value block observed by the workspace
 * listener after its changes commit.
 */
function resolveVerbPicker(block, verbEndingIndex, presetsById, getDisplayOptions, variantOverride) {
	const moodBlock = block.getInputTargetBlock("MOOD_SLOT");
	const subjectBlock = block.getInputTargetBlock("SUBJECT_SLOT");
	const mood = block.getFieldValue("MOOD") ?? moodBlock?.getFieldValue("MOOD");
	const subjectValue = block.getFieldValue("SUBJECT") ?? subjectBlock?.getFieldValue("COMBO");
	const { person: sPerson, number: sNumber } = subjectValue
		? parsePersonNumber(subjectValue)
		: { person: undefined, number: undefined };
	const polarity = block.getFieldValue("POLARITY") ?? "positive";

	const objectBlock = block.getInputTargetBlock("OBJECT_SLOT");
	const isTransitive = objectBlock != null;
	const transitivity = isTransitive ? "transitive" : "intransitive";
	const { person: oPerson, number: oNumber } = isTransitive
		? parsePersonNumber(objectBlock.getFieldValue("COMBO"))
		: { person: undefined, number: undefined };

	const candidates = mood && subjectValue
		? candidatesFor(verbEndingIndex, mood, transitivity, sPerson, sNumber, oPerson, oNumber, polarity)
		: [];
	const variantInput = block.getInput("VARIANT_GROUP");
	const variantField = block.getField("VARIANT");

	let resolvedId = null;
	if (candidates.length === 1) {
		resolvedId = candidates[0].id;
		if (variantInput) variantInput.setVisible(false);
	} else if (candidates.length > 1) {
		block.verbPickerState = { candidateOptions: candidates.map((c) => [c.label.slice(0, 70), c.id]) };
		if (variantInput) variantInput.setVisible(true);
		const currentValue = variantOverride ?? variantField?.getValue();
		const stillValid = candidates.some((c) => c.id === currentValue);
		resolvedId = stillValid ? currentValue : candidates[0].id;
		// Only re-point the field at a new default when the *previous*
		// combination's variant no longer applies -- never overwrite a
		// value this exact call is already in the middle of committing.
		if (!stillValid && variantField && variantOverride === undefined) variantField.setValue(resolvedId);
	} else {
		if (variantInput) variantInput.setVisible(false);
	}

	block.data = resolvedId;
	const resolvedField = block.getField("RESOLVED");
	if (resolvedField) {
		const preset = resolvedId ? presetsById.get(resolvedId) : null;
		const missing = !mood && !moodBlock ? "choose a mood" : !subjectValue ? "choose a subject" : "no such ending in the catalog";
		resolvedField.setValue(preset ? labelFor(preset, getDisplayOptions()) : `(${missing})`);
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
	const { moodOptions, subjectOptions, polarityOptions, polarityMapping } = verbEndingPickerFields(verbEndingIndex, resolveMoodLabel, resolvePersonLabel);

	function onVariantChange(newValue) {
		const block = this.getSourceBlock();
		if (block) resolveVerbPicker(block, verbEndingIndex, presetsById, getDisplayOptions, newValue);
		return newValue;
	}

	Blockly.Blocks[VERB_MOOD_TYPE] = {
		init() {
			this.appendDummyInput()
				.appendField(new Blockly.FieldDropdown(moodOptions), "MOOD");
			this.setOutput(true, VERB_MOOD_CONNECTION_TYPE);
			this.setStyle(INFLECTION_BLOCK_STYLE);
			this.setInputsInline(true);
			this.setTooltip("Verb mood");
		},
	};

	Blockly.Blocks[VERB_SUBJECT_TYPE] = {
		init() {
			this.appendDummyInput()
				.appendField(new Blockly.FieldDropdown(subjectOptions), "COMBO");
			this.setOutput(true, VERB_SUBJECT_CONNECTION_TYPE);
			this.setStyle(INFLECTION_BLOCK_STYLE);
			this.setInputsInline(true);
			this.setTooltip("Verb subject");
		},
	};

	Blockly.Blocks[VERB_ENDING_PICKER_TYPE] = {
		init() {
			this.verbPickerState = { candidateOptions: [["—", "NONE"]] };

			this.appendDummyInput("CONFIG")
				.appendField("Verb ending")
				.appendField(new Blockly.FieldDropdown(moodOptions), "MOOD")
				.appendField(new FieldDependentDropdown("MOOD", polarityMapping, polarityOptions), "POLARITY")
				.appendField(new Blockly.FieldDropdown(subjectOptions), "SUBJECT");
			this.appendValueInput("OBJECT_SLOT")
				.setCheck(VERB_OBJECT_CONNECTION_TYPE)
				.appendField("object (optional)");
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
				}, onVariantChange), "VARIANT");
			this.appendDummyInput()
				.appendField(new Blockly.FieldLabelSerializable(""), "RESOLVED");

			this.setPreviousStatement(true, CONNECTION_TYPE);
			this.setNextStatement(true, CONNECTION_TYPE);
			this.setStyle(INFLECTION_BLOCK_STYLE);
			this.setInputsInline(true);
			resolveVerbPicker(this, verbEndingIndex, presetsById, getDisplayOptions);
		},
	};

	Blockly.Blocks[VERB_ENDING_PICKER_TYPE].__resolve = (block) =>
		resolveVerbPicker(block, verbEndingIndex, presetsById, getDisplayOptions);
}

/**
 * Registers the small object-selector block (bl-oq-ly#20 follow-up): a
 * value/output block, never part of the main stem-to-ending chain, whose
 * only purpose is plugging sideways into a verb ending picker's OBJECT_SLOT.
 * Its own COMBO dropdown is the same "I"/"you"/"he, she, it" choice the
 * subject selector uses, just for the object role.
 * @param {ReturnType<typeof buildVerbEndingIndex>} verbEndingIndex
 * @param {(person: number, number: string) => string} resolvePersonLabel oq's public-api export.
 */
export function defineVerbObjectBlock(verbEndingIndex, resolvePersonLabel) {
	const objectOptions = verbEndingIndex.objectCombos.map((c) => [personNumberLabel(c, resolvePersonLabel), c]);
	Blockly.Blocks[VERB_OBJECT_TYPE] = {
		init() {
			this.appendDummyInput()
				.appendField(new Blockly.FieldDropdown(objectOptions), "COMBO");
			this.setOutput(true, VERB_OBJECT_CONNECTION_TYPE);
			this.setStyle(INFLECTION_BLOCK_STYLE);
			this.setInputsInline(true);
			this.setTooltip("Verb object");
		},
	};
}

/**
 * Wires reactivity for plugging/unplugging the object block and editing its
 * dropdown. Those changes need to
 * re-resolve the OWNING picker -- not just whichever block's event actually
 * fired. VARIANT remains a field on the parent with its own validator. One workspace-
 * level listener, not one per block, since a picker block doesn't exist yet
 * (and the workspace doesn't either) at defineVerbEndingPickerBlock() time
 * -- app.js calls this once, right after Blockly.inject().
 *
 * Re-resolves every picker block on the workspace on every relevant event
 * rather than trying to trace which picker owns the block that changed --
 * workspaces here hold at most a handful of blocks, so the redundant work
 * is negligible, and it sidesteps having to walk from a moved/changed block
 * back up to whichever picker (if any) it's connected under. Self-
 * terminating: resolveVerbPicker's own field.setValue() calls only actually
 * fire a further change event when the value is genuinely different (a
 * Blockly Field's own no-op guard), so a resolve that lands on an unchanged
 * result doesn't retrigger this listener again.
 * @param {ReturnType<typeof Blockly.inject>} workspace
 */
export function registerVerbPickerReactivity(workspace) {
	const resolveAll = () => {
		for (const block of workspace.getAllBlocks(false)) {
			if (block.type === VERB_ENDING_PICKER_TYPE) Blockly.Blocks[VERB_ENDING_PICKER_TYPE].__resolve(block);
		}
	};
	workspace.addChangeListener((event) => {
		if (event.type !== Blockly.Events.BLOCK_MOVE && event.type !== Blockly.Events.BLOCK_CHANGE) return;
		resolveAll();
	});
	// Serialization loads with Blockly events suppressed. Resolve once when
	// registering so a rebuilt workspace does not retain a stale picker state.
	resolveAll();
}

export { VERB_ENDING_PICKER_TYPE, VERB_MOOD_TYPE, VERB_SUBJECT_TYPE, VERB_OBJECT_TYPE };

/** True when `preset` is a real verb-mood inflectional ending -- one of the
 * ~278 entries carrying a structured `inflection.subject` (paradigm
 * coordinates), as opposed to a case/possession ending or anything else.
 * Shared by buildToolbox() (which excludes these from the flat list) and
 * renderChain() (which needs to know to build a picker instance, not a
 * plain block, for one of these) so the two conditions can't drift apart. */
function isVerbEndingPreset(preset) {
	return preset.morpheme_type === "inflectional_ending" && Boolean(preset.seq?.[0]?.inflection?.subject);
}

/** "person|number" combo string shared by subject/object selector fields
 * (see verb-endings.js's personNumberKey/parsePersonNumber). */
function comboKey(person, number) {
	return `${person}|${number}`;
}

/**
 * Populates a freshly-created verb ending picker with matching mood, polarity,
 * and subject fields (plus an object block for a transitive ending) for a specific
 * real morpheme id -- mood, subject, polarity, object, and (when `preset.id` is one
 * of the ~23 that share paradigm coordinates with another ending) the right
 * VARIANT -- so the block stays as adjustable as if it had been dragged
 * fresh from the toolbox, rather than a frozen, non-interactive stand-in
 * for that one id. `block` must already be initSvg()'d/render()'d (each
 * setFieldValue below fires the field's own validator, which re-renders as
 * it goes -- see resolveVerbPicker's own `if (block.rendered)` guard).
 * @param {ReturnType<typeof Blockly.inject>} workspace
 */
function restoreVerbPickerFields(workspace, block, preset) {
	const inflection = preset.seq[0].inflection;
	block.setFieldValue(inflection.mood, "MOOD");
	block.setFieldValue(comboKey(inflection.subject.person, inflection.subject.number), "SUBJECT");
	block.setFieldValue(inflection.polarity ?? "positive", "POLARITY");
	if (inflection.object) {
		const objectBlock = workspace.newBlock(VERB_OBJECT_TYPE);
		objectBlock.initSvg();
		objectBlock.render();
		objectBlock.setFieldValue(comboKey(inflection.object.person, inflection.object.number), "COMBO");
		block.getInput("OBJECT_SLOT").connection.connect(objectBlock.outputConnection);
	}
	// Selector connections resolve through workspace events in normal use;
	// force one synchronously while restoring so the variant check below sees
	// the final coordinate immediately.
	Blockly.Blocks[VERB_ENDING_PICKER_TYPE].__resolve(block);
	// Only the paradigm coordinates above are guaranteed to already resolve
	// to `preset.id` -- when they resolve to more than one candidate (a
	// duplicate-coordinate combination), the variant dropdown defaults to
	// its first option, which isn't necessarily the specific id being
	// restored, so pick it explicitly.
	const variantField = block.getField("VARIANT");
	if (block.data !== preset.id && block.getInput("VARIANT_GROUP")?.isVisible() && variantField) {
		// Blockly's FieldDropdown caches its (dynamic, function-generated)
		// menu and validates a setValue() call against that cache -- the
		// SUBJECT/OBJECT field-change above is what populated
		// block.verbPickerState.candidateOptions with this combination's
		// real candidates, but the VARIANT field's own cached option list
		// was last generated back when it was still just [["—","NONE"]]
		// (block creation). Without forcing a refresh here, setFieldValue()
		// below silently no-ops -- preset.id isn't among the STALE cached
		// options -- leaving the field (and block.data) on whichever
		// candidate happened to resolve first, not the one being restored.
		variantField.getOptions(false);
		block.setFieldValue(preset.id, "VARIANT");
	}
}

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
		if (isVerbEndingPreset(preset)) continue;
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
			if (name === "Inflectional endings" && includeVerbPicker) {
				// Mood, polarity, and subject are fields on the ending itself:
				// they jointly select one API realization and have no independent
				// meaning elsewhere in the current word builder. Object remains
				// a separate typed block because its presence changes valency.
				blocks.unshift({ kind: "block", type: VERB_ENDING_PICKER_TYPE });
			}
			return {
				kind: "category",
				name: `${cat.name} (${blocks.length})`,
				categorystyle: `${cat.colourClass}_category`,
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
 * there. Used by Deconstruct's "Move to Word Builder" and by a restored
 * shareable-URL chain link (app.js): the learner gets the verified chain as
 * a live, editable stack to keep experimenting with, not a static read-only
 * display. Always lays out stem-first — see app.js's own comment on why
 * "read last-morpheme-first" doesn't flip the physical block stack, only
 * Deconstruct's row order and Build's separate reading-order line.
 *
 * A verb-mood ending gets a real, fully-adjustable picker instance (its
 * fields set to match that exact id, via restoreVerbPickerFields()), not the
 * plain frozen label block every other category uses -- an earlier version
 * of this function always used the plain block even here, on the reasoning
 * that the picker was purely a toolbox authoring convenience; real usage
 * showed that left a restored ending with no way to adjust it at all short
 * of deleting and re-dragging a fresh picker from the toolbox.
 */
export function renderChain(workspace, ids, presetsById, displayOptions) {
	for (const block of workspace.getTopBlocks(false)) block.dispose(false);
	let prev = null;
	for (const id of ids) {
		const preset = presetsById.get(id);
		if (!preset) continue;
		const isVerbEnding = isVerbEndingPreset(preset);
		const block = workspace.newBlock(isVerbEnding ? VERB_ENDING_PICKER_TYPE : blockTypeForCategory(categoryForPreset(preset)));
		if (!isVerbEnding) {
			block.data = id;
			block.setFieldValue(labelFor(preset, displayOptions), "LABEL");
		}
		block.initSvg();
		block.render();
		if (isVerbEnding) restoreVerbPickerFields(workspace, block, preset);
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
