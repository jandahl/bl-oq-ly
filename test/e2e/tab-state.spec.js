// Regression: switching Build/Deconstruct used to wipe the other tab.
// Deconstruct's setMode() cleared lastDeconstruct* and the breakdown DOM;
// the URL dropped the inactive tab's param, so a restore had nothing to
// put back. Both sides must survive a round-trip.
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	page.on("pageerror", (err) => {
		throw new Error(`Unexpected uncaught page error: ${err.message}`);
	});
	await page.goto("/");
	await expect(page.locator("#status-line")).toContainText("Loaded", { timeout: 20_000 });
});

test("switching tabs keeps a finished Deconstruct analysis", async ({ page }) => {
	await page.getByRole("button", { name: "qimmeqarpunga", exact: true }).click();
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 20_000 });
	await page.click("#mode-build");
	await expect(page.locator("#mode-build")).toHaveAttribute("aria-selected", "true");
	await page.click("#mode-deconstruct");
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga");
	await expect(page.locator("#word-input")).toHaveValue("qimmeqarpunga");
	await expect(page.locator("#move-to-builder-btn")).toBeVisible();
});

test("switching tabs keeps the Build canvas", async ({ page }) => {
	await page.evaluate(() => {
		const ws = Blockly.getMainWorkspace();
		for (const b of ws.getTopBlocks(false)) b.dispose(false);
		const stem = ws.newBlock("morpheme_block__stem_n");
		stem.data = "qimmeq";
		stem.initSvg();
		stem.render();
	});
	await expect(page.locator("#status-line")).toContainText("qimmeq");
	await page.click("#mode-deconstruct");
	await page.click("#mode-build");
	const n = await page.evaluate(() => Blockly.getMainWorkspace().getAllBlocks(false).length);
	expect(n).toBeGreaterThan(0);
	await expect(page.locator("#status-line")).toContainText("qimmeq");
});
