// @ts-check
import { defineConfig, devices } from "@playwright/test";

// Deliberately hits the REAL live endpoints (the published oq-api v0.0.5
// module and grammarian's published morphemes.json) rather than a local
// mirror — see README's
// "Testing" section for why: this repo's own stated stance is that a broken
// build here is a cue to check those upstreams, and a test suite that only
// ever exercises a frozen local snapshot would never catch that class of
// break, which is the single most likely source of regression given both
// upstreams' explicit no-stability-promise posture. The tradeoff is a real
// one (CI can go red for reasons outside this repo's own commits) — accepted
// deliberately, not overlooked.
export default defineConfig({
	testDir: "./test/e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	// Slightly generous: catalog fetch + Blockly injection is the app's own
	// natural startup cost, not something to race against.
	timeout: 30_000,
	use: {
		baseURL: "http://127.0.0.1:8000",
		trace: "retain-on-failure",
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
	],
	webServer: {
		command: "npm run serve",
		url: "http://127.0.0.1:8000",
		reuseExistingServer: !process.env.CI,
	},
});
