// The same published worked-example corpus that jandahl/oq uses for its
// forward-build and reverse-Deconstruct CI checks. Keep this live rather than
// copying the corpus into the app: the grammarian project is its source of
// truth and publishes the corpus specifically for downstream checks.
export const WORKED_EXAMPLES_URL = "https://jandahl.github.io/jandahl-custom-KAL-grammarian/grammar/latest/worked_examples.json";

/**
 * @returns {Promise<Array<{ surface: string, gloss?: string, chain?: string[] }>>}
 */
export async function loadWorkedExamples() {
	const res = await fetch(WORKED_EXAMPLES_URL);
	if (!res.ok) throw new Error(`worked examples fetch failed: ${res.status}`);
	const value = await res.json();
	const entries = Array.isArray(value?.flat) ? value.flat : value?.entries;
	if (!Array.isArray(entries)) throw new Error("worked examples have an unexpected shape");
	return entries.filter((entry) => typeof entry?.surface === "string" && entry.surface.length > 0);
}
