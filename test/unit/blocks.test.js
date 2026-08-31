import { test } from "node:test";
import assert from "node:assert/strict";
import { buildToolbox, chainFromTopBlock } from "../../docs/blocks.js";

// buildToolbox() and chainFromTopBlock() are the two blocks.js exports that
// don't touch the `Blockly` global, so they're unit-testable directly under
// Node — everything else (defineMorphemeBlocks, renderChain, relabelBlocks,
// the actual connection-check behaviour) needs a real Blockly runtime and is
// covered by test/e2e/ instead.

function preset(overrides) {
	return {
		id: "TEST_ID",
		glossShort: "test gloss",
		gloss: "test gloss (scholarly)",
		morpheme_type: "stem",
		word_class: "N",
		seq: [{}],
		...overrides,
	};
}

test("buildToolbox: groups presets into the right category by morpheme_type + word_class", () => {
	const presets = [
		preset({ id: "qimmeq", morpheme_type: "stem", word_class: "N" }),
		preset({ id: "aagialip", morpheme_type: "stem", word_class: "V" }),
		preset({ id: "N_qaq_Vb", morpheme_type: "derivational_affix", word_class: "" }),
	];
	const toolbox = buildToolbox(presets, { showIds: false });
	const names = toolbox.contents.map((c) => c.name);
	assert.ok(names.some((n) => n.startsWith("Stems — nouns (1)")));
	assert.ok(names.some((n) => n.startsWith("Stems — verbs (1)")));
	assert.ok(names.some((n) => n.startsWith("Derivational affixes (1)")));
});

test("buildToolbox: a category with zero matching presets doesn't appear at all (regression guard for the filter box feeling 'live')", () => {
	const presets = [preset({ id: "qimmeq", morpheme_type: "stem", word_class: "N" })];
	const toolbox = buildToolbox(presets, { showIds: false });
	const names = toolbox.contents.map((c) => c.name);
	assert.ok(!names.some((n) => n.startsWith("Enclitics")));
	assert.ok(!names.some((n) => n.startsWith("Particles")));
});

test("buildToolbox: showIds=false shows only the real Kalaallisut spelling + gloss, never the internal id, for a non-stem morpheme", () => {
	const presets = [preset({
		id: "V_IND_INTR_1SG",
		expected: "-vunga",
		glossShort: "statement — I",
		morpheme_type: "inflectional_ending",
		word_class: "",
		plainGloss: { en_mood_label: "statement" },
	})];
	const toolbox = buildToolbox(presets, { showIds: false });
	// "Inflectional endings" always gets the verb ending picker block
	// unshifted at index 0 (bl-oq-ly#18) -- find this entry by its own data
	// rather than assume a position.
	const category = toolbox.contents.find((c) => c.name.startsWith("Inflectional endings"));
	const entry = category.contents.find((b) => b.data === "V_IND_INTR_1SG");
	const label = entry.fields.LABEL;
	assert.equal(label, "-vunga — I");
	assert.ok(!label.includes("V_IND_INTR_1SG"), "internal id must not leak into the label when showIds is off");
	assert.ok(!label.includes("statement"), "mood label must be dropped from the block label entirely, not just hidden");
});

test("buildToolbox: showIds=true adds the internal id in front, without losing the spelling", () => {
	const presets = [preset({
		id: "V_IND_INTR_1SG",
		expected: "-vunga",
		glossShort: "statement — I",
		morpheme_type: "inflectional_ending",
		word_class: "",
		plainGloss: { en_mood_label: "statement" },
	})];
	const toolbox = buildToolbox(presets, { showIds: true });
	const category = toolbox.contents.find((c) => c.name.startsWith("Inflectional endings"));
	const entry = category.contents.find((b) => b.data === "V_IND_INTR_1SG");
	assert.equal(entry.fields.LABEL, "V_IND_INTR_1SG — -vunga — I");
});

test("buildToolbox: a stem's label uses its own id as the spelling (regression guard: this is why hiding ids used to also hide stem spellings by accident)", () => {
	const presets = [preset({ id: "qimmeq", expected: "qimmeq", glossShort: "dog", morpheme_type: "stem", word_class: "N" })];
	const toolbox = buildToolbox(presets, { showIds: false });
	assert.equal(toolbox.contents[0].contents[0].fields.LABEL, "qimmeq — dog");
});

test("buildToolbox: a real verb-mood ending (carrying inflection.subject) is excluded from the flat list -- it's only reachable via the conjugation picker (bl-oq-ly#18)", () => {
	const presets = [preset({
		id: "V_IND_INTR_1SG",
		expected: "-vunga",
		morpheme_type: "inflectional_ending",
		word_class: "",
		seq: [{ inflection: { mood: "indicative", transitivity: "intransitive", subject: { person: 1, number: "sg" } } }],
	})];
	const toolbox = buildToolbox(presets, { showIds: false });
	const category = toolbox.contents.find((c) => c.name.startsWith("Inflectional endings"));
	assert.ok(!category.contents.some((b) => b.data === "V_IND_INTR_1SG"));
	// The category still exists, containing only the picker block.
	assert.equal(category.contents.length, 1);
	assert.equal(category.contents[0].type, "morpheme_block__verb_ending_picker");
});

test("chainFromTopBlock: walks a fake block stack via getNextBlock(), collecting each block's .data", () => {
	const third = { type: "morpheme_block__inflection", data: "V_IND_INTR_1SG", getNextBlock: () => null };
	const second = { type: "morpheme_block__deriv_affix", data: "N_qaq_Vb", getNextBlock: () => third };
	const first = { type: "morpheme_block__stem_n", data: "qimmeq", getNextBlock: () => second };
	assert.deepEqual(chainFromTopBlock(first), ["qimmeq", "N_qaq_Vb", "V_IND_INTR_1SG"]);
});

test("chainFromTopBlock: a null/undefined chain link stops the walk cleanly", () => {
	const only = { type: "morpheme_block__stem_n", data: "qimmeq", getNextBlock: () => null };
	assert.deepEqual(chainFromTopBlock(only), ["qimmeq"]);
});

test("chainFromTopBlock: ignores a non-morpheme block type (defensive; shouldn't occur in practice since only morpheme blocks connect)", () => {
	const stray = { type: "some_other_block", data: "x", getNextBlock: () => null };
	assert.deepEqual(chainFromTopBlock(stray), []);
});
