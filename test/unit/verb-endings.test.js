import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVerbEndingIndex, candidatesFor, parsePersonNumber, personNumberLabel, moodDisplayLabel } from "../../docs/verb-endings.js";

function verbEndingPreset(id, mood, transitivity, subject, object, meaning) {
	return {
		id,
		morpheme_type: "inflectional_ending",
		meaning,
		glossShort: meaning,
		seq: [{ inflection: { mood, transitivity, subject, object } }],
	};
}

test("buildVerbEndingIndex: ignores non-inflectional-ending presets and inflectional endings without a subject (e.g. case endings)", () => {
	const presets = [
		{ id: "qimmeq", morpheme_type: "stem", seq: [{}] },
		{ id: "N_ABS_SG", morpheme_type: "inflectional_ending", seq: [{}] },
		verbEndingPreset("V_IND_INTR_1SG", "indicative", "intransitive", { person: 1, number: "sg" }),
	];
	const index = buildVerbEndingIndex(presets);
	assert.deepEqual(candidatesFor(index, "indicative", "intransitive", 1, "sg"), [{ id: "V_IND_INTR_1SG", label: "V_IND_INTR_1SG" }]);
	assert.deepEqual(candidatesFor(index, "indicative", "intransitive", 2, "sg"), []);
});

test("buildVerbEndingIndex: an intransitive ending resolves without needing an object", () => {
	const presets = [verbEndingPreset("V_IND_INTR_3SG", "indicative", "intransitive", { person: 3, number: "sg" }, undefined, "he/she/it Vs")];
	const index = buildVerbEndingIndex(presets);
	const found = candidatesFor(index, "indicative", "intransitive", 3, "sg");
	assert.equal(found.length, 1);
	assert.equal(found[0].id, "V_IND_INTR_3SG");
});

test("buildVerbEndingIndex: a transitive ending requires matching object person/number too, not just subject", () => {
	const presets = [verbEndingPreset("V_IND_TR_1SG_3SG", "indicative", "transitive", { person: 1, number: "sg" }, { person: 3, number: "sg" }, "I V him/her/it")];
	const index = buildVerbEndingIndex(presets);
	assert.equal(candidatesFor(index, "indicative", "transitive", 1, "sg", 3, "sg").length, 1);
	// Same subject, wrong object -> no match.
	assert.equal(candidatesFor(index, "indicative", "transitive", 1, "sg", 2, "sg").length, 0);
});

// Regression guard for the real duplicate-coordinate case this module exists
// to handle: bl-oq-ly#18's own investigation found 23 real catalog endings
// sharing identical (mood, transitivity, subject, object) coordinates (e.g.
// plain vs. negative contemporative) -- a lookup that silently picked one
// and discarded the other would quietly make an attested ending
// unreachable through the picker.
test("buildVerbEndingIndex: two real endings sharing identical paradigm coordinates both survive as candidates, not just the last one indexed", () => {
	const presets = [
		verbEndingPreset("V_CONT_INTR_1SG", "contemporative", "intransitive", { person: 1, number: "sg" }, undefined, "while I V"),
		verbEndingPreset("V_CONTNEG_1SG", "contemporative", "intransitive", { person: 1, number: "sg" }, undefined, "while I do not V"),
	];
	const index = buildVerbEndingIndex(presets);
	const found = candidatesFor(index, "contemporative", "intransitive", 1, "sg");
	assert.equal(found.length, 2);
	assert.deepEqual(new Set(found.map((c) => c.id)), new Set(["V_CONT_INTR_1SG", "V_CONTNEG_1SG"]));
});

test("candidatesFor: an unknown combination returns an empty array, never throws or returns undefined", () => {
	const index = buildVerbEndingIndex([]);
	assert.deepEqual(candidatesFor(index, "indicative", "intransitive", 1, "sg"), []);
});

test("parsePersonNumber: splits a combined 'person|number' dropdown value back into its two parts", () => {
	assert.deepEqual(parsePersonNumber("3|sg"), { person: 3, number: "sg" });
	assert.deepEqual(parsePersonNumber("1|pl"), { person: 1, number: "pl" });
});

// moodDisplayLabel/personNumberLabel take oq's resolveMoodLabel/
// resolvePersonLabel in as parameters rather than importing oq-api.js
// directly (see this module's header comment: oq-api.js's top-level https
// import breaks under plain Node) -- these fakes stand in for the real
// functions, just enough to prove the wiring (technical-key mapping,
// person/number splitting) is correct.
function fakeResolveMoodLabel(technicalKey) {
	return { text: `plain:${technicalKey}`, title: technicalKey };
}
function fakeResolvePersonLabel(person, number) {
	return `${person}${number}`;
}

test("moodDisplayLabel: passes the mapped technical key through to the injected resolveMoodLabel", () => {
	assert.equal(moodDisplayLabel("indicative", fakeResolveMoodLabel), "plain:IND");
	assert.equal(moodDisplayLabel("interrogative", fakeResolveMoodLabel), "plain:INTERR");
});

test("moodDisplayLabel: an unmapped mood falls back to its own uppercased name rather than throwing", () => {
	assert.equal(moodDisplayLabel("some_future_mood", fakeResolveMoodLabel), "plain:SOME_FUTURE_MOOD");
});

test("moodDisplayLabel: causative/conditional/iterative/participial split DIFF/SAME on subject person 4, defaulting to DIFF (person 3) when omitted", () => {
	assert.equal(moodDisplayLabel("causative", fakeResolveMoodLabel), "plain:CAU_DIFF");
	assert.equal(moodDisplayLabel("causative", fakeResolveMoodLabel, 3), "plain:CAU_DIFF");
	assert.equal(moodDisplayLabel("causative", fakeResolveMoodLabel, 4), "plain:CAU_SAME");
});

test("personNumberLabel: splits the combo and forwards to the injected resolvePersonLabel with an uppercased number", () => {
	assert.equal(personNumberLabel("3|sg", fakeResolvePersonLabel), "3SG");
	assert.equal(personNumberLabel("1|pl", fakeResolvePersonLabel), "1PL");
});

