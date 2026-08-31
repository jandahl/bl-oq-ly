// @ts-check
// Full-catalog regression guard for labelFor() (docs/blocks.js): runs every
// real published morpheme through it, in every display-option combination,
// and checks it never throws and always returns a string.
//
// This started life as test/unit/labelFor-catalog.test.js, hitting the live
// catalog directly under plain Node via test/helpers/catalog.js. That
// helper imports docs/oq-api.js, which does a top-level `await
// import("https://...")` — plain Node's ESM loader can't do https imports
// (ERR_UNSUPPORTED_ESM_URL_SCHEME), so the test could never actually run
// under `node --test`. Moved here instead: a real browser's import() has no
// such restriction, and this suite already hits the same live endpoints
// (see playwright.config.js's own comment) — page.evaluate() with a dynamic
// import of the app's own modules is the natural fit.
//
// Exists because labelFor() shipped a real bug every hand-picked test
// fixture missed: grammarian's own CLAUDE.md documents that
// `plainGloss.en_short`/`da_short` "may be legacy strings or context maps
// keyed by ... default, third_singular, and gerund" -- true for ~40 of 1957
// real catalog entries (verb postbases like V_yumaaq_Vb, "shall eventually
// V"), and labelFor() read it as a bare string, throwing "label.slice is
// not a function" the moment a learner's display options touched one of
// those ~2% of entries. A fixture built by hand would need to happen to
// include one of those ~40 ids to ever catch this -- exhaustively running
// every real preset through labelFor() is the only check that can't miss
// it.
import { test, expect } from "@playwright/test";

test.setTimeout(60_000);

test("labelFor: every real catalog preset, in every display-option combination, produces a string and never throws", async ({ page }) => {
	page.on("pageerror", (err) => {
		throw new Error(`Unexpected uncaught page error: ${err.message}`);
	});
	await page.goto("/");
	await expect(page.locator("#status-line")).toContainText("Loaded", { timeout: 20_000 });

	const result = await page.evaluate(async () => {
		const { labelFor } = await import("/blocks.js");
		const { mergeMorphemeSources, GRAMMAR_MORPHEMES_URL } = await import("/oq-api.js");

		const res = await fetch(GRAMMAR_MORPHEMES_URL);
		if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
		const value = await res.json();
		const { presets } = mergeMorphemeSources([{ status: "fulfilled", value }], [{ buildable: true, source: "grammarian" }]);

		const optionCombinations = [
			{ showIds: false, lang: "en", spellingMode: "both" },
			{ showIds: true, lang: "en", spellingMode: "both" },
			{ showIds: false, lang: "en", spellingMode: "gloss-only" },
			{ showIds: false, lang: "en", spellingMode: "spelling-only" },
			{ showIds: false, lang: "da", spellingMode: "both" },
			{ showIds: false, lang: "da", spellingMode: "gloss-only" },
		];

		const failures = [];
		for (const opts of optionCombinations) {
			for (const preset of presets) {
				try {
					const label = labelFor(preset, opts);
					if (typeof label !== "string") failures.push(`${preset.id} ${JSON.stringify(opts)}: returned ${typeof label}, not a string`);
				} catch (err) {
					failures.push(`${preset.id} ${JSON.stringify(opts)}: threw ${err.message}`);
				}
			}
		}
		return { presetCount: presets.length, failures };
	});

	expect(result.presetCount).toBeGreaterThan(1000);
	expect(result.failures).toEqual([]);
});
