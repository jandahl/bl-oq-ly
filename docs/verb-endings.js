// Indexes grammarian's ~278 verb-mood inflectional endings (the ones
// carrying a structured `inflection: {mood, transitivity, subject, object?}`
// block, per CLAUDE.md's verb_moods.yaml convention) by their own paradigm
// coordinates, so blocks.js's conjugation-style picker block can resolve
// "statement, 1st singular" -> a real morpheme id the same way oq's own
// conjugation modal does, instead of making a learner find it in a
// 355-entry flat list.
//
// Label TEXT (mood names, person/number combinations) is oq's own, resolved
// via resolveMoodLabel()/resolvePersonLabel() (oq#881's public-api export)
// -- the exact same friendly wording oq's own "conjugate to..." modal shows
// (plain-language by default, technical-term fallback, pronoun preference
// honored), rather than this repo maintaining its own independent rendering
// of the same categories. Those two functions are passed IN as parameters
// below rather than imported directly from oq-api.js at module scope: this
// module has no browser/network dependency of its own and stays importable
// under plain Node (test/unit/verb-endings.test.js) -- oq-api.js's top-level
// `await import("https://...")` breaks the ESM loader outside a browser (the
// same ERR_UNSUPPORTED_ESM_URL_SCHEME hit elsewhere in this repo), so nothing
// in this module or blocks.js imports it; only app.js does, wiring the two
// resolver functions through at call time (dependency injection).
//
// 23 of those 278 collide on identical (mood, transitivity, subject, object)
// coordinates — e.g. plain vs. negative contemporative ("while I V" vs.
// "while I do not V"), or a distinct "near-future" imperative form — real
// grammatical distinctions the four paradigm axes don't capture. Those need
// a secondary "variant" choice; see buildVerbEndingIndex()'s `candidates`.

// Preferred display order for known values; anything encountered that isn't
// listed here sorts after, in first-seen order — keeps the dropdowns from
// silently breaking if the catalog gains a new mood/etc., just puts it last.
const MOOD_ORDER = [
	"indicative", "interrogative", "imperative", "optative",
	"causative", "conditional", "contemporative", "iterative", "participial",
];
const TRANSITIVITY_ORDER = ["intransitive", "transitive"];
// Natural pronoun order (I/you/he.../we/you-all/they), not numeric person
// order, for the combined subject/object dropdown -- matches how any of
// these paradigms is conventionally taught/tabulated.
const PERSON_NUMBER_ORDER = ["1|sg", "2|sg", "3|sg", "1|pl", "2|pl", "3|pl", "4|sg", "4|pl"];

function orderedUnique(values, preferredOrder) {
	const seen = new Set(values);
	const ordered = preferredOrder.filter((v) => seen.has(v));
	for (const v of values) if (!ordered.includes(v)) ordered.push(v);
	return ordered;
}

function keyOf(mood, transitivity, sPerson, sNumber, oPerson, oNumber, polarity = "positive") {
	return [mood, transitivity, sPerson, sNumber, oPerson ?? "", oNumber ?? "", polarity].join("|");
}

function personNumberKey(person, number) {
	return `${person}|${number}`;
}

/**
 * @param {any[]} presets
 * @returns {{
 *   index: Map<string, Array<{ id: string, label: string }>>,
 *   moods: string[], transitivities: string[], polarities: string[],
 *   polaritiesByMood: Map<string, string[]>,
 *   subjectCombosByMoodTransitivity: Map<string, string[]>,
 *   subjectCombos: string[], objectCombos: string[],
 * }}
 */
export function buildVerbEndingIndex(presets) {
	const moods = [], transitivities = [], polarities = [], subjectCombos = [], objectCombos = [];
	const polaritiesByMood = new Map();
	const subjectCombosByMoodTransitivity = new Map();
	/** @type {Map<string, Array<{ id: string, label: string }>>} */
	const index = new Map();

	for (const preset of presets) {
		const inflection = preset.seq?.[0]?.inflection;
		if (preset.morpheme_type !== "inflectional_ending" || !inflection?.subject) continue;
		const { mood, transitivity, subject, object } = inflection;
		const polarity = inflection.polarity ?? "positive";
		moods.push(mood);
		transitivities.push(transitivity);
		polarities.push(polarity);
		const moodPolarities = polaritiesByMood.get(mood) ?? [];
		if (!moodPolarities.includes(polarity)) moodPolarities.push(polarity);
		polaritiesByMood.set(mood, moodPolarities);
		subjectCombos.push(personNumberKey(subject.person, subject.number));
		const subjectKey = `${mood}|${transitivity}`;
		const subjectCombo = personNumberKey(subject.person, subject.number);
		const moodSubjects = subjectCombosByMoodTransitivity.get(subjectKey) ?? [];
		if (!moodSubjects.includes(subjectCombo)) moodSubjects.push(subjectCombo);
		subjectCombosByMoodTransitivity.set(subjectKey, moodSubjects);
		if (object) objectCombos.push(personNumberKey(object.person, object.number));

		const key = keyOf(mood, transitivity, subject.person, subject.number, object?.person, object?.number, polarity);
		const label = preset.meaning || preset.glossShort || preset.id;
		const list = index.get(key) ?? [];
		list.push({ id: preset.id, label });
		index.set(key, list);
	}

	return {
		index,
		moods: orderedUnique(moods, MOOD_ORDER),
		transitivities: orderedUnique(transitivities, TRANSITIVITY_ORDER),
		polarities: orderedUnique(polarities, ["positive", "negative"]),
		polaritiesByMood: new Map([...polaritiesByMood].map(([mood, values]) => [mood, orderedUnique(values, ["positive", "negative"])])),
		subjectCombosByMoodTransitivity: new Map([...subjectCombosByMoodTransitivity].map(([key, values]) => [key, orderedUnique(values, PERSON_NUMBER_ORDER)])),
		subjectCombos: orderedUnique(subjectCombos, PERSON_NUMBER_ORDER),
		objectCombos: orderedUnique(objectCombos, PERSON_NUMBER_ORDER),
	};
}

/** Looks up the candidate(s) for one paradigm coordinate. Empty array = no such ending in the catalog. */
export function candidatesFor(verbEndingIndex, mood, transitivity, sPerson, sNumber, oPerson, oNumber, polarity = "positive") {
	return verbEndingIndex.index.get(keyOf(mood, transitivity, sPerson, sNumber, oPerson, oNumber, polarity)) ?? [];
}

/** Splits a combined "person|number" dropdown value back into its two parts. */
export function parsePersonNumber(combo) {
	const [person, number] = String(combo).split("|");
	return { person: Number(person), number };
}

/** Human label for a combined "person|number" dropdown value, via oq's own
 * resolvePersonLabel() (passed in -- see this file's header comment) -- the
 * same "I"/"we"/"he, she, it"/... wording oq's conjugation modal shows,
 * honoring the visitor's stored pronoun preference for the two gendered
 * combinations (3sg/4sg). Used for both the subject and object dropdowns --
 * oq's own modal uses the same wording for both roles, so this repo does
 * too, rather than inventing a separate accusative ("me"/"him"/...)
 * vocabulary oq itself doesn't have.
 * @param {string} combo
 * @param {(person: number, number: string) => string} resolvePersonLabel
 */
export function personNumberLabel(combo, resolvePersonLabel) {
	const { person, number } = parsePersonNumber(combo);
	return resolvePersonLabel(person, number.toUpperCase());
}

// Maps grammarian's own lowercase inflection.mood value to oq's structured,
// uppercase technical mood key (docs/conjugation.js's MOOD_KEYS/
// SUBJECT_SPLIT_MOODS in the oq repo) so resolveMoodLabel() -- which expects
// that key space, not grammarian's -- can resolve it. Four moods
// (causative/conditional/iterative/participial) split into a "different
// subject"/"same subject" pair keyed on whether the subject is person 4
// (reflexive/coreferential) -- see oq's parseEndingEntry() for the same
// split. This dropdown's own options are static (computed once, not
// per-selection), so the label always uses the "different subject" (person
// 3) reading; the DIFF/SAME distinction itself still surfaces correctly in
// the variant dropdown/resolved-spelling preview once a real subject is
// picked, since candidatesFor() keys on the real subject.person throughout.
const MOOD_TECHNICAL_KEY = {
	indicative: () => "IND",
	interrogative: () => "INTERR",
	imperative: () => "IMP",
	optative: () => "OPT",
	causative: (person) => (person === 4 ? "CAU_SAME" : "CAU_DIFF"),
	conditional: (person) => (person === 4 ? "COND_SAME" : "COND_DIFF"),
	contemporative: () => "CONT",
	iterative: (person) => (person === 4 ? "ITER_SAME" : "ITER_DIFF"),
	participial: (person) => (person === 4 ? "PART_SAME" : "PART_DIFF"),
};

/** Human label for a mood, via oq's own resolveMoodLabel() (passed in -- see
 * this file's header comment) -- plain-language by default ("statement",
 * not "indicative"), same wording oq's own conjugation modal shows.
 * `subjectPerson` picks the DIFF/SAME technical key for the four moods that
 * split on it (see MOOD_TECHNICAL_KEY above); defaults to the "different
 * subject" (person 3) reading when omitted, which is what a static
 * dropdown-options list (mood picked before subject) needs.
 * @param {string} mood
 * @param {(mood: string) => { text: string, title: string|null }} resolveMoodLabel
 * @param {number} [subjectPerson]
 */
export function moodDisplayLabel(mood, resolveMoodLabel, subjectPerson = 3) {
	const keyFn = MOOD_TECHNICAL_KEY[mood];
	const technicalKey = keyFn ? keyFn(subjectPerson) : String(mood).toUpperCase();
	return resolveMoodLabel(technicalKey).text;
}
