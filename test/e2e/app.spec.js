// @ts-check
// End-to-end suite against the real app in a real browser — codifying the
// checks that, until now, only ever existed as one-off scripts written by
// hand each round and thrown away afterward. Every scenario here caught a
// real shipped bug at least once (see each test's own comment for which).
//
// Deliberately hits the published oq-api package and grammarian's live catalog
// (see playwright.config.js's own comment) rather than a local fixture —
// this repo's whole stated posture is that a break here can be this repo's
// own bug OR an upstream one, and only testing against a frozen local
// snapshot would hide the second kind entirely.
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	// Uncaught JS exceptions always mean something real broke -- fail hard.
	page.on("pageerror", (err) => {
		throw new Error(`Unexpected uncaught page error: ${err.message}`);
	});
	// A failed network request's URL isn't available from a console message
	// (Chrome deliberately omits it from console.error's own text for a
	// resource-load failure), so this checks page.on("response") instead,
	// which does carry the URL. Blockly's own default media path
	// (blockly-demo.appspot.com/static/media/*.png etc.) 404s/resets against
	// any origin that isn't blockly-demo.appspot.com itself -- cosmetic,
	// unrelated to this app, expected on every load, filtered out by
	// hostname here so a real regression isn't lost in known noise.
	page.on("response", (response) => {
		if (response.ok()) return;
		// A reload can legitimately revalidate a cached local module. Playwright's
		// response.ok() excludes 304 even though the browser uses its cached body
		// successfully, so this is not a failed resource load.
		if (response.status() === 304) return;
		if (new URL(response.url()).hostname === "blockly-demo.appspot.com") return;
		throw new Error(`Unexpected failed request: ${response.status()} ${response.url()}`);
	});
	await page.goto("/");
	await expect(page.locator("#status-line")).toContainText("Loaded", { timeout: 20_000 });
});

test("catalog loads with a real morpheme count and surfaces the non-authoritative note", async ({ page }) => {
	const status = await page.textContent("#status-line");
	expect(status).toMatch(/Loaded \d{3,} morphemes\./);
	expect(status).toContain("hand-authored, not yet dictionary-verified");
});

test("Deconstruct: example words load into the analyzer", async ({ page }) => {
	await page.getByRole("button", { name: "qimmeqarpunga", exact: true }).click();
	await expect(page.locator("#word-input")).toHaveValue("qimmeqarpunga");
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 20_000 });
});

test("Deconstruct: examples cover noun, verb, affix, ending, enclitic, and transitive verb forms", async ({ page }) => {
	const examples = page.locator("[data-example-word]");
	await expect(examples).toHaveCount(6);
	const classes = await examples.evaluateAll((nodes) => nodes.map((node) => node.dataset.exampleClass));
	expect(classes).toEqual([
		"noun",
		"verb",
		"derivational affix",
		"inflectional ending",
		"enclitic",
		"transitive verb",
	]);
	const words = await examples.evaluateAll((nodes) => nodes.map((node) => node.dataset.exampleWord));
	expect(new Set(words).size).toBe(words.length);
});

test("Deconstruct: oq CI worked examples open in a filterable modal", async ({ page }) => {
	await page.getByRole("button", { name: "Extended examples" }).click();
	const modal = page.getByRole("dialog", { name: "oq CI worked examples" });
	await expect(modal).toBeVisible();
	await expect(modal.locator("#worked-examples-status")).toContainText("examples", { timeout: 20_000 });
	await expect.poll(() => modal.locator("#worked-examples-list button").count(), { timeout: 20_000 }).toBeGreaterThan(400);
	await modal.locator("#worked-examples-filter").fill("nerivugut");
	await expect(modal.locator("#worked-examples-list button")).toHaveCount(1);
	await expect(modal.locator("#worked-examples-list button")).toContainText("nerivugut");
	await modal.locator("#worked-examples-close").click();
	await expect(modal).toBeHidden();
});

async function dragFirstFlyoutBlockIntoWorkspace(page, categoryLabelText, dropX, dropY) {
	const category = page.locator('[role="treeitem"]').filter({ hasText: categoryLabelText }).first();
	await category.click({ force: true });
	await page.waitForTimeout(400);
	const block = page.locator(".blocklyFlyout .blocklyDraggable").first();
	const box = await block.boundingBox();
	if (!box) throw new Error("flyout block has no bounding box");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(dropX, dropY, { steps: 10 });
	await page.mouse.up();
	await page.waitForTimeout(500);
}

test("Build: dragging a single stem in produces a complete-word status (regression guard: buildWord() wiring)", async ({ page }) => {
	await dragFirstFlyoutBlockIntoWorkspace(page, "Stems — nouns", 250, 120);
	await expect(page.locator("#status")).toHaveClass(/ok/);
	await expect(page.locator("#status-line")).not.toBeEmpty();
	await expect(page.locator("#status .meta")).toContainText("complete word");
});

test("Build: toolbox blocks are colour-coded per category, not a single shared colour (bl-oq-ly#6: Blockly silently ignores a per-instance toolbox colour override)", async ({ page }) => {
	const stemColour = await page.evaluate(() => {
		const ws = Blockly.getMainWorkspace();
		const b = ws.newBlock("morpheme_block__stem_n");
		const colour = b.getColour();
		b.dispose(false);
		return colour;
	});
	const affixColour = await page.evaluate(() => {
		const ws = Blockly.getMainWorkspace();
		const b = ws.newBlock("morpheme_block__deriv_affix");
		const colour = b.getColour();
		b.dispose(false);
		return colour;
	});
	expect(stemColour).not.toEqual(affixColour);
	// Exact light-theme values derived from oq's canonical nominal_root and
	// derivational_affix HSL coordinates, converted to hex for Blockly 12.
	expect(stemColour).toBe("#416ec8");
	expect(affixColour).toBe("#c89b41");
});

test("Build: block labels always show the real Kalaallisut spelling, and hide grammarian's internal id by default (bl-oq-ly#10/#14)", async ({ page }) => {
	await page.fill("#morpheme-filter", "N_qaq_Vb");
	await page.locator('[role="treeitem"]').first().click({ force: true });
	await page.waitForTimeout(400);
	const label = await page.locator(".blocklyFlyout .blocklyDraggable text").first().textContent();
	expect(label).toContain("-qaq");
	expect(label).not.toContain("N_qaq_Vb");

	await page.click("#opt-show-ids");
	await page.waitForTimeout(400);
	await page.locator('[role="treeitem"]').first().click({ force: true });
	await page.waitForTimeout(400);
	const labelWithId = await page.locator(".blocklyFlyout .blocklyDraggable text").first().textContent();
	expect(labelWithId).toContain("N_qaq_Vb");
	expect(labelWithId).toContain("-qaq");
	expect(labelWithId.indexOf("-qaq")).toBeLessThan(labelWithId.indexOf("N_qaq_Vb"));
});

test("Build: the morpheme display option explicitly prepends the morpheme to its gloss", async ({ page }) => {
	const options = await page.locator("#opt-spelling option").allTextContents();
	expect(options).toEqual(["Show before gloss", "Show without gloss", "Hide (gloss only)"]);

	await page.fill("#morpheme-filter", "nngit");
	await page.locator('[role="treeitem"]', { hasText: "Sentential affixes" }).click({ force: true });
	const label = await page.locator(".blocklyFlyout .blocklyDraggable text").filter({ hasText: /^-nngit\s+—\s+negation/ }).textContent();
	expect(label.indexOf("-nngit")).toBe(0);
});

test("Build: filtering by -nngit surfaces the ordinary negator by its Kalaallisut form", async ({ page }) => {
	await page.fill("#morpheme-filter", "nngit");
	const sententialCategory = page.locator('[role="treeitem"]', { hasText: "Sentential affixes" });
	await expect(sententialCategory).toBeVisible();
	await sententialCategory.click({ force: true });
	await expect(page.locator(".blocklyFlyout .blocklyDraggable text").filter({ hasText: /^-nngit\s+—\s+negation/ })).toBeVisible();
});

test("Build: verb ending exposes inline mood, polarity, and subject controls", async ({ page }) => {
	const result = await page.evaluate(() => {
		const ws = Blockly.getMainWorkspace();
		const block = ws.newBlock("morpheme_block__verb_ending_picker");
		block.initSvg();
		block.render();
		const incomplete = {
			data: block.data,
			resolved: block.getFieldValue("RESOLVED"),
			hasOwnMoodField: block.getField("MOOD") !== null,
			inputOrder: block.inputList.map((input) => input.name),
			inputsInline: block.inputsInline,
		};
		Blockly.Blocks[block.type].__resolve(block);
		const initial = { data: block.data, resolved: block.getFieldValue("RESOLVED"), hasObject: block.getInputTargetBlock("OBJECT_SLOT") !== null };

		block.setFieldValue("interrogative", "MOOD");
		Blockly.Blocks[block.type].__resolve(block);
		const questionDefault = { data: block.data, subject: block.getFieldValue("SUBJECT") };
		block.setFieldValue("3|sg", "SUBJECT");
		Blockly.Blocks[block.type].__resolve(block);
		const afterChange = { data: block.data, resolved: block.getFieldValue("RESOLVED") };
		block.setFieldValue("imperative", "MOOD");
		Blockly.Blocks[block.type].__resolve(block);
		const commandDefault = { data: block.data, subject: block.getFieldValue("SUBJECT") };

		// Polarity is explicit: the dependent field exposes the negative
		// contemporative instead of treating it as an opaque variant.
		block.setFieldValue("contemporative", "MOOD");
		block.setFieldValue("1|sg", "SUBJECT");
		block.setFieldValue("negative", "POLARITY");
		Blockly.Blocks[block.type].__resolve(block);
		const negative = { data: block.data, polarity: block.getFieldValue("POLARITY"), variantVisible: block.getInput("VARIANT_GROUP").isVisible() };

		block.dispose(false);
		return { incomplete, initial, questionDefault, commandDefault, afterChange, negative };
	});

	expect(result.incomplete.data).toBeTruthy();
	expect(result.incomplete.resolved).not.toBe("");
	expect(result.incomplete.hasOwnMoodField).toBe(true);
	expect(result.incomplete.inputOrder[0]).toBe("RESOLVED");
	expect(result.incomplete.inputsInline).toBe(false);
	expect(result.initial.data).toBeTruthy();
	expect(result.initial.resolved).not.toBe("");
	expect(result.initial.hasObject).toBe(false); // nothing plugged into OBJECT_SLOT yet -- intransitive
	expect(result.questionDefault).toEqual({ data: "V_INTERR_INTR_3SG", subject: "3|sg" });
	expect(result.commandDefault.data).toMatch(/^V_IMP_INTR_/);
	expect(["2|sg", "1|pl", "2|pl"]).toContain(result.commandDefault.subject);
	expect(result.afterChange.data).toBeTruthy();
	expect(result.afterChange.resolved).not.toContain("(no such ending"); // interrogative 3sg is a real form
	expect(result.negative).toEqual({ data: "V_CONTNEG_1SG", polarity: "negative", variantVisible: false });
});

test("Build: the palette's verb ending arrives with inline mood, polarity, and subject fields", async ({ page }) => {
	await dragFirstFlyoutBlockIntoWorkspace(page, "Inflectional endings", 420, 180);
	const result = await page.evaluate(() => {
		const block = Blockly.getMainWorkspace().getAllBlocks(false)
			.find((candidate) => candidate.type === "morpheme_block__verb_ending_picker");
		return block && {
			data: block.data,
			mood: block.getFieldValue("MOOD"),
			polarity: block.getFieldValue("POLARITY"),
			subject: block.getFieldValue("SUBJECT"),
		};
	});
	expect(result).toEqual({
		data: "V_IND_INTR_1SG",
		mood: "indicative",
		polarity: "positive",
		subject: "1|sg",
	});

	// Renderer changes rebuild the workspace through serialization; the
	// composed ending and its defaults must survive that round-trip intact.
	await page.selectOption("#blockly-theme-select", "zelos");
	await expect.poll(() => page.evaluate(() => {
		const block = Blockly.getMainWorkspace().getAllBlocks(false)
			.find((candidate) => candidate.type === "morpheme_block__verb_ending_picker");
		return block && {
			data: block.data,
			mood: block.getFieldValue("MOOD"),
			polarity: block.getFieldValue("POLARITY"),
			subject: block.getFieldValue("SUBJECT"),
		};
	})).toEqual({ data: "V_IND_INTR_1SG", mood: "indicative", polarity: "positive", subject: "1|sg" });
});

test("Build: plugging a verb-object block into the picker's OBJECT_SLOT makes it transitive and drives the conjugation; unplugging reverts to intransitive (bl-oq-ly#20 follow-up)", async ({ page }) => {
	// registerVerbPickerReactivity() reacts to real Blockly workspace events,
	// which (unlike a field validator's own synchronous call) fire on a
	// later tick, not inside the same page.evaluate() call that triggers
	// them -- confirmed empirically (a same-call read raced the event and
	// always saw the stale value). Each step below is its own evaluate()
	// call with an expect.poll() in between, giving the event loop a turn.
	const beforePlug = await page.evaluate(() => {
		const ws = Blockly.getMainWorkspace();
		for (const b of ws.getTopBlocks(false)) b.dispose(false);
		const picker = ws.newBlock("morpheme_block__verb_ending_picker");
		picker.initSvg();
		picker.render();
		Blockly.Blocks[picker.type].__resolve(picker);
		window.__picker = picker;
		return { data: picker.data, resolved: picker.getFieldValue("RESOLVED") };
	});
	expect(beforePlug.data).toBe("V_IND_INTR_1SG"); // default mood/subject, no object -> intransitive

	await page.evaluate(() => {
		const ws = Blockly.getMainWorkspace();
		const obj = ws.newBlock("morpheme_block__verb_object");
		obj.initSvg();
		obj.render();
		obj.setFieldValue("3|sg", "COMBO");
		window.__obj = obj;
		window.__picker.getInput("OBJECT_SLOT").connection.connect(obj.outputConnection);
	});
	await expect.poll(() => page.evaluate(() => window.__picker.data)).toBe("V_IND_TR_1SG_3SG"); // same mood/subject, now transitive with a 3sg object
	const afterPlug = await page.evaluate(() => window.__picker.getInputTargetBlock("OBJECT_SLOT") !== null);
	expect(afterPlug).toBe(true);

	// Editing the plugged-in object's own dropdown must re-resolve the
	// OWNING picker too -- a field validator on the picker itself can't
	// observe a change on a different (connected) block, which is exactly
	// what registerVerbPickerReactivity() exists for.
	await page.evaluate(() => window.__obj.setFieldValue("2|sg", "COMBO"));
	await expect.poll(() => page.evaluate(() => window.__picker.data)).toBe("V_IND_TR_1SG_2SG");

	await page.evaluate(() => { window.__obj.unplug(true); window.__obj.dispose(false); });
	await expect.poll(() => page.evaluate(() => window.__picker.data)).toBe("V_IND_INTR_1SG"); // back to intransitive
	const hasObjectAfterUnplug = await page.evaluate(() => window.__picker.getInputTargetBlock("OBJECT_SLOT") !== null);
	expect(hasObjectAfterUnplug).toBe(false);

	await page.evaluate(() => { window.__picker.dispose(false); delete window.__picker; delete window.__obj; });
});

test("Build: verb ending picker, once connected into a chain, builds the real word via buildWord() (bl-oq-ly#18)", async ({ page }) => {
	await page.evaluate(() => {
		const ws = Blockly.getMainWorkspace();
		for (const b of ws.getTopBlocks(false)) b.dispose(false);
		const stem = ws.newBlock("morpheme_block__stem_n");
		stem.data = "qimmeq";
		stem.initSvg(); stem.render();
		const affix = ws.newBlock("morpheme_block__deriv_affix");
		affix.data = "N_qaq_Vb";
		affix.initSvg(); affix.render();
		const ending = ws.newBlock("morpheme_block__verb_ending_picker");
		ending.initSvg(); ending.render();
		Blockly.Blocks[ending.type].__resolve(ending); // inline defaults resolve to V_IND_INTR_1SG
		stem.nextConnection.connect(affix.previousConnection);
		affix.nextConnection.connect(ending.previousConnection);
	});
	await expect(page.locator("#status")).toHaveClass(/ok/, { timeout: 10_000 });
	await expect(page.locator("#status-line")).toHaveText("qimmeqarpunga");
	await expect(page.locator("#reading-line")).toHaveText("I have a dog");
});

test("Build: filtering the palette hides the verb ending picker entirely (bl-oq-ly#18: it has no id/gloss text to match a query)", async ({ page }) => {
	await page.fill("#morpheme-filter", "qimme");
	await page.waitForTimeout(400);
	const names = await page.locator('[role="treeitem"]').allTextContents();
	expect(names.some((n) => n.startsWith("Inflectional endings"))).toBe(false);
});

test("Danish gloss language: block labels and Deconstruct's translation switch to Danish text (bl-oq-ly#17)", async ({ page }) => {
	await page.selectOption("#opt-lang", "da");
	await page.fill("#word-input", "qimmeqarpunga");
	await page.click("#analyze-btn");
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 15_000 });
	const translation = await page.textContent("#primary-breakdown .breakdown-translation");
	expect(translation.toLowerCase()).toContain("hund"); // Danish for "dog"
});

test("Spelling-visibility mode: gloss-only and spelling-only each show exactly what they promise (bl-oq-ly#17)", async ({ page }) => {
	const stemCat = page.locator('[role="treeitem"]').filter({ hasText: "Stems — nouns" }).first();

	await page.selectOption("#opt-spelling", "gloss-only");
	await stemCat.click({ force: true });
	await page.waitForTimeout(400);
	const glossOnlyLabel = await page.locator(".blocklyFlyout .blocklyDraggable text").first().textContent();
	expect(glossOnlyLabel).not.toContain(" — "); // "both" mode's only separator -- gloss-only never joins two parts

	await page.selectOption("#opt-spelling", "spelling-only");
	await stemCat.click({ force: true });
	await page.waitForTimeout(400);
	const spellingOnlyLabel = await page.locator(".blocklyFlyout .blocklyDraggable text").first().textContent();
	expect(spellingOnlyLabel).not.toContain(" — ");
});

test("Build: directional connections — word starts accept only a container, endings can take an enclitic, and particles remain standalone (bl-oq-ly#11/#15)", async ({ page }) => {
	const result = await page.evaluate(() => {
		const ws = Blockly.getMainWorkspace();
		const mk = (type) => { const b = ws.newBlock(type); b.initSvg(); b.render(); return b; };
		const stem = mk("morpheme_block__stem_n");
		const ending = mk("morpheme_block__inflection");
		const enclitic = mk("morpheme_block__enclitic");
		const particle = mk("morpheme_block__particle");
		const out = {
			stemHasPrevious: stem.previousConnection !== null,
			endingHasNext: ending.nextConnection !== null,
			endingToEncliticTypeChecks: ending.nextConnection
				? ending.nextConnection.getConnectionChecker().doTypeChecks(ending.nextConnection, enclitic.previousConnection)
				: null,
			encliticHasNext: enclitic.nextConnection !== null,
			particleHasPrevious: particle.previousConnection !== null,
			particleHasNext: particle.nextConnection !== null,
		};
		for (const b of [stem, ending, enclitic, particle]) b.dispose(false);
		return out;
	});
	expect(result.stemHasPrevious).toBe(true);
	expect(result.endingHasNext).toBe(true);
	expect(result.endingToEncliticTypeChecks).toBe(true);
	expect(result.encliticHasNext).toBe(false);
	expect(result.particleHasPrevious).toBe(true);
	expect(result.particleHasNext).toBe(false);
});

test("Build: palette Hide/Show actually hides the toolbox, and never throws (bl-oq-ly#9: updateToolbox(null) throws — must use Toolbox.setVisible())", async ({ page }) => {
	await expect(page.locator(".blocklyToolbox")).toBeVisible();
	await page.click("#palette-toggle");
	await page.waitForTimeout(300);
	await expect(page.locator(".blocklyToolbox")).toBeHidden();
	await page.click("#palette-toggle");
	await page.waitForTimeout(300);
	await expect(page.locator(".blocklyToolbox")).toBeVisible();
});

test("Build: filter narrows the toolbox and closes any already-open flyout (bl-oq-ly#9: a stale flyout used to keep showing unfiltered content)", async ({ page }) => {
	await page.locator('[role="treeitem"]').filter({ hasText: "Derivational affixes" }).first().click({ force: true });
	await page.waitForTimeout(400);
	await expect(page.locator(".blocklyFlyout .blocklyDraggable").first()).toBeVisible();
	await page.fill("#morpheme-filter", "qimme");
	await page.waitForTimeout(400);
	// The flyout must CLOSE on filter, not keep showing the previously-open
	// category's now-irrelevant contents. Blockly reuses the flyout's own DOM
	// (blocks stay present but hidden when closed), so checking block COUNT
	// would pass even while stale content sits there invisibly -- what
	// actually matters is that no flyout block is actually visible.
	await expect(page.locator(".blocklyFlyout .blocklyDraggable:visible")).toHaveCount(0);
	await expect(page.locator('[role="treeitem"]')).toHaveText([/Stems — nouns \(1\)/, /Words \(1\)/]);
});

test("Build: theme toggle actually re-themes Blockly's own chrome, not just the page (bl-oq-ly#7)", async ({ page }) => {
	const initial = await page.evaluate(() => Blockly.getMainWorkspace().getTheme().name);
	await page.click("#theme-toggle"); // auto -> light
	await page.click("#theme-toggle"); // light -> dark
	await page.waitForTimeout(200);
	const afterDark = await page.evaluate(() => Blockly.getMainWorkspace().getTheme().name);
	expect(afterDark).toContain("dark");
	expect(afterDark).not.toBe(initial === "bl-oq-ly-dark" ? undefined : initial);
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("Build: Blockly theme dropdown switches to Zelos and persists the choice", async ({ page }) => {
	await page.selectOption("#blockly-theme-select", "zelos");
	await expect.poll(() => page.evaluate(() => Blockly.getMainWorkspace().getTheme().name)).toMatch(/zelos/);
	await expect.poll(() => page.evaluate(() => Blockly.getMainWorkspace().getRenderer().constructor.name)).toMatch(/zelos/i);
	await page.reload();
	await expect(page.locator("#status-line")).toContainText("Loaded", { timeout: 20_000 });
	await expect(page.locator("#blockly-theme-select")).toHaveValue("zelos");
	await expect.poll(() => page.evaluate(() => Blockly.getMainWorkspace().getTheme().name)).toMatch(/zelos/);
	await expect.poll(() => page.evaluate(() => Blockly.getMainWorkspace().getRenderer().constructor.name)).toMatch(/zelos/i);
});

test("Deconstruct: qimmeqarpunga produces the composed sentence AND the per-morpheme breakdown, not a raw id list (bl-oq-ly#4/#16)", async ({ page }) => {
	await page.fill("#word-input", "qimmeqarpunga");
	await page.click("#analyze-btn");
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 15_000 });
	// The single most important regression this suite exists to prevent:
	// bl-oq-ly shipped " · "-joined per-morpheme fragments TWICE where oq's
	// own Deconstruct shows one composed sentence.
	await expect(page.locator("#primary-breakdown .breakdown-translation")).toHaveText("I have a dog");

	const rows = page.locator("#primary-breakdown .breakdown-row");
	await expect(rows).toHaveCount(3);
	const rowText = await rows.allTextContents();
	expect(rowText.some((t) => t.includes("qimmeq") && t.includes("dog"))).toBe(true);
	expect(rowText.some((t) => /statement/i.test(t))).toBe(true); // as its own badge, not folded into the gloss

	// No raw grammarian id (e.g. "V_IND_INTR_1SG") should leak into the breakdown.
	for (const t of rowText) expect(t).not.toMatch(/[A-Z]_[A-Z]/);
});

test("Deconstruct: lower-ranked verified breakdowns are folded and link to their own builder chains", async ({ page }) => {
	await page.fill("#word-input", "qimmeqarpunga");
	await page.click("#analyze-btn");
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 15_000 });
	const alternatives = page.locator("#alternative-breakdowns");
	await expect(alternatives).toBeVisible();
	await expect(alternatives).not.toHaveAttribute("open", "");
	await expect(alternatives.locator(".alternative-breakdown")).toHaveCount(2);
	await expect(alternatives.locator(".breakdown-builder-link")).toHaveCount(2);
	await expect(alternatives.locator(".breakdown-builder-link").first()).toHaveAttribute("href", /chain=/);
});

test("Deconstruct: reading-order toggle reverses the rows but never the composed translation (bl-oq-ly#11)", async ({ page }) => {
	await page.fill("#word-input", "qimmeqarpunga");
	await page.click("#analyze-btn");
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 15_000 });

	// "Read last morpheme first" defaults ON (index.html's #opt-reading-order
	// starts checked), so the FIRST row on a fresh Deconstruct is already the
	// last morpheme (the mood ending), not the stem.
	const firstRowEndingFirst = await page.locator("#primary-breakdown .breakdown-row").first().locator(".breakdown-spelling").textContent();
	expect(firstRowEndingFirst).toContain("vunga");

	await page.click("#opt-reading-order"); // turn off -> stem-first
	await page.waitForTimeout(300);
	const firstRowAfterToggle = await page.locator("#primary-breakdown .breakdown-row").first().locator(".breakdown-spelling").textContent();
	expect(firstRowAfterToggle).toContain("qimmeq");
	await expect(page.locator("#primary-breakdown .breakdown-translation")).toHaveText("I have a dog");
});

test("Deconstruct instantly recreates the verified chain as connected, editable blocks", async ({ page }) => {
	await page.fill("#word-input", "qimmeqarpunga");
	await page.click("#analyze-btn");
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 15_000 });
	await page.waitForTimeout(500);
	const chain = await page.evaluate(() => {
		const ws = Blockly.getMainWorkspace();
		const tops = ws.getTopBlocks(true);
		return tops.map((top) => {
			if (top.type === "morpheme_block__word_container") top = top.getInputTargetBlock("MORPHEMES");
			const ids = [];
			let cur = top;
			while (cur) { ids.push(cur.data); cur = cur.getNextBlock(); }
			return ids;
		});
	});
	expect(chain).toEqual([["qimmeq", "N_qaq_Vb", "V_IND_INTR_1SG"]]);
	await expect(page.locator("#status")).toHaveClass(/ok/);
	await expect(page.locator("#reading-line")).toHaveText("I have a dog");

	// The ending block must be a real, adjustable picker instance -- not a
	// frozen label block with no dropdown at all (user report: a restored
	// ending had no way to change its mood/person short of deleting it and
	// dragging a fresh picker from the toolbox).
	const endingBlock = await page.evaluate(() => {
		const block = Blockly.getMainWorkspace().getAllBlocks(false).find((b) => b.type === "morpheme_block__verb_ending_picker");
		return block && {
			data: block.data,
			mood: block.getFieldValue("MOOD"),
			moodOptionCount: block.getField("MOOD").getOptions().length,
			polarity: block.getFieldValue("POLARITY"),
			subject: block.getFieldValue("SUBJECT"),
		};
	});
	expect(endingBlock).toEqual({ data: "V_IND_INTR_1SG", mood: "indicative", moodOptionCount: 9, polarity: "positive", subject: "1|sg" });
});

test("Build: a restored verb ending block stays live -- changing its mood dropdown re-resolves to a different real morpheme", async ({ page }) => {
	await page.fill("#word-input", "qimmeqarpunga");
	await page.click("#analyze-btn");
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 15_000 });
	await page.waitForTimeout(500);

	const afterChange = await page.evaluate(() => {
		const block = Blockly.getMainWorkspace().getAllBlocks(false).find((b) => b.type === "morpheme_block__verb_ending_picker");
		block.setFieldValue("optative", "MOOD");
		Blockly.Blocks[block.type].__resolve(block);
		return { data: block.data, resolved: block.getFieldValue("RESOLVED") };
	});
	expect(afterChange.data).toBe("V_OPT_INTR_1SG");
	expect(afterChange.resolved).not.toContain("no such ending");
	await expect(page.locator("#status")).toHaveClass(/ok/);
});

test("Shareable links: a chain link naming one of the duplicate-coordinate variants (V_CONTNEG_1SG) restores that exact variant, not just the first candidate", async ({ page }) => {
	// A fresh page/context for this navigation, not a second goto() on the
	// beforeEach's own `page` -- a repeat same-origin fetch of oq's
	// public-api.js can legitimately come back 304 (cache revalidation) on
	// CI's real network, which beforeEach's response.ok() check (correctly)
	// treats as worth investigating for every OTHER resource, but not this
	// one: 304 is not a failure here, just a second load in one browser
	// session. Matches the pattern the other Shareable-links tests already
	// use for exactly this reason.
	const page2 = await page.context().newPage();
	page2.on("pageerror", (err) => { throw new Error(`Unexpected uncaught page error: ${err.message}`); });
	await page2.goto("/?chain=neri,V_CONTNEG_1SG");
	await expect(page2.locator("#status-line")).toHaveText("nerinanga", { timeout: 20_000 });
	const block = await page2.evaluate(() => {
		const b = Blockly.getMainWorkspace().getAllBlocks(false).find((b) => b.type === "morpheme_block__verb_ending_picker");
	return b && { data: b.data, polarity: b.getFieldValue("POLARITY"), variant: b.getFieldValue("VARIANT") };
	});
	expect(block).toEqual({ data: "V_CONTNEG_1SG", polarity: "negative", variant: "NONE" });
	await page2.close();
});

test("Shareable links: a chain link naming a transitive ending restores it with a real object block plugged into OBJECT_SLOT, not just the subject (bl-oq-ly#20 follow-up)", async ({ page }) => {
	const page2 = await page.context().newPage();
	page2.on("pageerror", (err) => { throw new Error(`Unexpected uncaught page error: ${err.message}`); });
	await page2.goto("/?chain=taku,V_IND_TR_1SG_3SG");
	await expect(page2.locator("#status")).toHaveClass(/ok/, { timeout: 20_000 });
	const picker = await page2.evaluate(() => {
		const b = Blockly.getMainWorkspace().getAllBlocks(false).find((b) => b.type === "morpheme_block__verb_ending_picker");
		const obj = b?.getInputTargetBlock("OBJECT_SLOT");
		return b && { data: b.data, objectType: obj?.type, objectCombo: obj?.getFieldValue("COMBO") };
	});
	expect(picker).toEqual({ data: "V_IND_TR_1SG_3SG", objectType: "morpheme_block__verb_object", objectCombo: "3|sg" });
	await page2.close();
});

test("Shareable links: building a chain live-updates the URL, and reloading a chain link restores the same word (router.js)", async ({ page }) => {
	await page.evaluate(() => {
		const ws = Blockly.getMainWorkspace();
		for (const b of ws.getTopBlocks(false)) b.dispose(false);
		const stem = ws.newBlock("morpheme_block__stem_n");
		stem.data = "qimmeq";
		stem.initSvg(); stem.render();
		const affix = ws.newBlock("morpheme_block__deriv_affix");
		affix.data = "N_qaq_Vb";
		affix.initSvg(); affix.render();
		stem.nextConnection.connect(affix.previousConnection);
	});
	await expect.poll(() => page.evaluate(() => location.search)).toBe("?chain=qimmeq%2CN_qaq_Vb");

	const shareUrl = await page.evaluate(() => location.href);
	const page2 = await page.context().newPage();
	await page2.goto(shareUrl);
	await expect(page2.locator("#status-line")).toHaveText("qimmeqaq", { timeout: 15_000 });
	await page2.close();
});

test("Shareable links: a verified Deconstruct result pushes word+chain into the URL, and reloading it restores the analysis on the canvas (router.js)", async ({ page }) => {
	await page.fill("#word-input", "qimmeqarpunga");
	await page.click("#analyze-btn");
	await expect(page.locator("#primary-breakdown .breakdown-word")).toHaveText("qimmeqarpunga", { timeout: 15_000 });
	await expect.poll(() => page.evaluate(() => location.search)).toContain("word=qimmeqarpunga");
	await expect.poll(() => page.evaluate(() => location.search)).toContain("chain=");

	const shareUrl = await page.evaluate(() => location.href);
	const page2 = await page.context().newPage();
	await page2.goto(shareUrl);
	await expect(page2.locator("#word-input")).toHaveValue("qimmeqarpunga");
	await expect(page2.locator("#primary-breakdown .breakdown-translation")).toHaveText("I have a dog", { timeout: 20_000 });
	await expect(page2.locator("#status-line")).toHaveText("qimmeqarpunga");
	await page2.close();
});

test("Shareable links: display options (language, spelling mode) are deliberately NOT in the URL -- they stay a per-visitor preference, not shared content", async ({ page }) => {
	await page.selectOption("#opt-lang", "da");
	await page.selectOption("#opt-spelling", "gloss-only");
	await page.waitForTimeout(200);
	const search = await page.evaluate(() => location.search);
	expect(search).not.toContain("lang");
	expect(search).not.toContain("spelling");
});

test("Build: on a phone-width viewport, the toolbox tree stays a minority of the canvas width instead of dominating it (bl-oq-ly#20)", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 700 });
	await page.waitForTimeout(200);
	const { blocklyDivWidth, toolboxDivWidth } = await page.evaluate(() => ({
		blocklyDivWidth: document.querySelector("#blockly-div").getBoundingClientRect().width,
		toolboxDivWidth: document.querySelector(".blocklyToolbox").getBoundingClientRect().width,
	}));
	expect(toolboxDivWidth / blocklyDivWidth).toBeLessThan(0.5);
});

test("Build: pinch-to-zoom is enabled on the workspace (bl-oq-ly#20 -- Blockly doesn't turn this on by default)", async ({ page }) => {
	const pinchEnabled = await page.evaluate(() => Blockly.getMainWorkspace().options.zoomOptions.pinch);
	expect(pinchEnabled).toBe(true);
});
