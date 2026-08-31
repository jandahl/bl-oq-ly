import { test } from "node:test";
import assert from "node:assert/strict";
import { splitMoodLabel, composedTranslation } from "../../docs/gloss.js";

test("splitMoodLabel: strips a colon-delimited mood label (glossSummaryItems' `gloss` convention)", () => {
	assert.deepEqual(splitMoodLabel("statement: I have a dog", "statement"), {
		moodLabel: "statement",
		rest: "I have a dog",
	});
});

test("splitMoodLabel: strips an em-dash-delimited mood label (`shortGloss` convention)", () => {
	assert.deepEqual(splitMoodLabel("statement — I", "statement"), {
		moodLabel: "statement",
		rest: "I",
	});
});

test("splitMoodLabel: no moodLabel -> text passes through unchanged", () => {
	assert.deepEqual(splitMoodLabel("dog", null), { moodLabel: null, rest: "dog" });
});

test("splitMoodLabel: moodLabel present but text doesn't start with it -> falls back to the whole text (bl-oq-ly regression guard: never silently truncate real content)", () => {
	assert.deepEqual(splitMoodLabel("dog", "statement"), { moodLabel: null, rest: "dog" });
});

test("composedTranslation: uses the LAST item's gloss, strips its mood label, capitalizes it", () => {
	const items = [
		{ gloss: "dog", shortGloss: "dog", moodLabel: null },
		{ gloss: "to have a dog", shortGloss: "to have a dog", moodLabel: null },
		{ gloss: "statement: he/she/it has a dog", shortGloss: "statement — he/she/it", moodLabel: "statement" },
	];
	assert.equal(composedTranslation(items), "He/she/it has a dog");
});

test("composedTranslation: empty sequence -> empty string, not a crash", () => {
	assert.equal(composedTranslation([]), "");
});

test("composedTranslation: falls back to shortGloss when gloss is absent", () => {
	const items = [{ gloss: "", shortGloss: "dog", moodLabel: null }];
	assert.equal(composedTranslation(items), "Dog");
});

// Regression guard for bl-oq-ly's own history: this is the exact bug shipped
// twice (Deconstruct, then Build's reading line) -- joining each item's own
// fragment with a separator instead of using the last item's already-composed
// sentence. A caller that (re-)introduces per-item joining would still pass
// composedTranslation()'s own unit tests above but produce the wrong string
// end-to-end; this test pins the real multi-morpheme shape those two bugs
// actually had.
test("composedTranslation: real 3-morpheme qimmeqarpunga shape produces the fused sentence, not a per-morpheme join", () => {
	const items = [
		{ gloss: "dog", shortGloss: "dog", moodLabel: null },
		{ gloss: "to have a dog", shortGloss: "to have a dog", moodLabel: null },
		{ gloss: "statement: I have a dog", shortGloss: "statement — I", moodLabel: "statement" },
	];
	const result = composedTranslation(items);
	assert.equal(result, "I have a dog");
	assert.notEqual(result, "dog · to have a dog · statement — I");
});
