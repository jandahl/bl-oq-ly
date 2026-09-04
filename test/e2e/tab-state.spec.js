// Regression: Build and Deconstruct used to be exclusive tabs, so switching
// one wiped the other. They now share one workspace: a successful analysis
// opens a collapsing details panel AND drops the verified chain on the
// canvas. Both must remain.
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	page.on("pageerror", (err) => {
		throw new Error(`Unexpected uncaught page error: ${err.message}`);
	});
	await page.goto("/");
	await expect(page.locator("#status-line")).toContainText("Loaded", { timeout: 20_000 });
});

test("a finished analysis stays in the details panel while the canvas shows the same chain", async ({ page }) => {
	await page.getByRole("button", { name: "qimmeqarpunga", exact: true }).click();
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 20_000 });
	await expect(page.locator("#word-input")).toHaveValue("qimmeqarpunga");
	await expect(page.locator("#breakdown-details")).toBeVisible();
	await expect(page.locator("#blockly-div")).toBeVisible();
	await expect(page.locator("#status-line")).toHaveText("qimmeqarpunga");
	await expect.poll(() => page.evaluate(() => Blockly.getMainWorkspace().getAllBlocks(false).length)).toBeGreaterThan(0);
});

test("collapsing the analysis details does not wipe the Build canvas", async ({ page }) => {
	await page.getByRole("button", { name: "qimmeqarpunga", exact: true }).click();
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 20_000 });
	await expect(page.locator("#status-line")).toHaveText("qimmeqarpunga");

	await page.locator("#breakdown-summary").click();
	await expect(page.locator("#breakdown-details")).not.toHaveAttribute("open");
	await expect(page.locator("#primary-breakdown")).toBeHidden();

	await expect.poll(() => page.evaluate(() => Blockly.getMainWorkspace().getAllBlocks(false).length)).toBeGreaterThan(0);
	await expect(page.locator("#status-line")).toHaveText("qimmeqarpunga");
	await expect(page.locator("#word-input")).toHaveValue("qimmeqarpunga");
});
