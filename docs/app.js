import { buildWord, analyzeWordAsync, glossSummaryItems } from "./oq-api.js";
import { loadCatalog } from "./catalog.js";
import { defineMorphemeBlocks, buildToolbox, topLevelChains, renderChain, relabelBlocks } from "./blocks.js";
import { renderBreakdown } from "./breakdown.js";
import { buildBlocklyThemes } from "./theme.js";
import { composedTranslation } from "./gloss.js";

const statusEl = document.getElementById("status");
const statusLine = document.getElementById("status-line");
const modeBuildBtn = document.getElementById("mode-build");
const modeDeconstructBtn = document.getElementById("mode-deconstruct");
const panelBuild = document.getElementById("panel-build");
const panelDeconstruct = document.getElementById("panel-deconstruct");
const wordInput = document.getElementById("word-input");
const analyzeBtn = document.getElementById("analyze-btn");
const blocklyDiv = document.getElementById("blockly-div");
const breakdownDiv = document.getElementById("breakdown");
const themeToggleBtn = document.getElementById("theme-toggle");
const paletteToggleBtn = document.getElementById("palette-toggle");
const filterInput = document.getElementById("morpheme-filter");
const moveToBuilderBtn = document.getElementById("move-to-builder-btn");
const showIdsCheckbox = document.getElementById("opt-show-ids");
const readingOrderCheckbox = document.getElementById("opt-reading-order");
const readingLine = document.getElementById("reading-line");

let mode = "build";
let presets = [];
let presetsById = new Map();
let workspace = null;
let deconstructAbort = null;
let paletteVisible = true;
let lastDeconstructIds = null;
let blocklyThemes = null;
let lastBuildSeq = null;
let lastDeconstructWord = "";
let lastDeconstructSeq = null;
let lastDeconstructBuilt = null;

// --- Display options (bl-oq-ly#10, #11), persisted like the theme.
const SHOW_IDS_KEY = "bl-oq-ly:show-ids";
const READING_ORDER_KEY = "bl-oq-ly:reading-order";

function showIds() {
	return showIdsCheckbox.checked;
}

function readLastFirst() {
	return readingOrderCheckbox.checked;
}

function initDisplayOptions() {
	showIdsCheckbox.checked = localStorage.getItem(SHOW_IDS_KEY) === "true";
	readingOrderCheckbox.checked = localStorage.getItem(READING_ORDER_KEY) !== "false"; // default on
	showIdsCheckbox.addEventListener("change", () => {
		localStorage.setItem(SHOW_IDS_KEY, String(showIdsCheckbox.checked));
		if (workspace) relabelBlocks(workspace, presetsById, showIds());
		applyToolbox();
	});
	readingOrderCheckbox.addEventListener("change", () => {
		localStorage.setItem(READING_ORDER_KEY, String(readingOrderCheckbox.checked));
		// Only Deconstruct's per-morpheme rows are reversible -- Build's
		// reading line is a composed sentence, unaffected (see gloss.js).
		if (lastDeconstructIds) rerenderBreakdown();
	});
}

/**
 * Shows the same composed, full-sentence translation Deconstruct does (e.g.
 * "qimmeqarpunga" -> "I have a dog"), not a " · "-joined list of each
 * morpheme's own fragment -- an earlier version of this line did the latter
 * and never picked up the composedTranslation() fix once that shipped for
 * Deconstruct, the same bug in a second place. A single composed sentence
 * isn't a reversible list, so the European-reading-order toggle
 * (bl-oq-ly#11) doesn't apply here -- see gloss.js's own comment. It's kept
 * as a distinct display element from Build's status line for a different
 * reason: physically flipping the Blockly block stack to visually read
 * ending-first would conflict with two things that must stay stem-first --
 * buildWord()'s own required sequence order, and the one-directional
 * connection constraints in blocks.js -- so this exists to give a
 * European-friendly translation without touching the block stack itself.
 */
function updateReadingLine(seq) {
	if (!seq) {
		readingLine.hidden = true;
		return;
	}
	readingLine.textContent = composedTranslation(glossSummaryItems(seq));
	readingLine.hidden = false;
}

// --- Theme (bl-oq-ly#7): a real toggle, not just following the OS. Cycles
// auto -> light -> dark -> auto. "auto" clears the override so style.css's
// prefers-color-scheme media query decides, matching the OS as before.
// Blockly's own toolbox/flyout/workspace chrome is themed separately via
// theme.js + workspace.setTheme(), since it doesn't read CSS custom
// properties at all — see that file's comment.
const THEME_KEY = "bl-oq-ly:theme";
const THEME_CYCLE = ["auto", "light", "dark"];
const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function isEffectivelyDark() {
	const explicit = document.documentElement.dataset.theme;
	if (explicit === "dark") return true;
	if (explicit === "light") return false;
	return prefersDarkQuery.matches;
}

function syncBlocklyTheme() {
	if (workspace && blocklyThemes) workspace.setTheme(isEffectivelyDark() ? blocklyThemes.dark : blocklyThemes.light);
}

function applyTheme(theme) {
	if (theme === "auto") delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = theme;
	themeToggleBtn.textContent = `Theme: ${theme[0].toUpperCase()}${theme.slice(1)}`;
	syncBlocklyTheme();
}

function initTheme() {
	const stored = localStorage.getItem(THEME_KEY);
	applyTheme(THEME_CYCLE.includes(stored) ? stored : "auto");
	themeToggleBtn.addEventListener("click", () => {
		const current = document.documentElement.dataset.theme || "auto";
		const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
		localStorage.setItem(THEME_KEY, next);
		applyTheme(next);
	});
	// Keep "auto" reactive to a live OS theme change, not just at load time.
	prefersDarkQuery.addEventListener("change", () => {
		if (!document.documentElement.dataset.theme) syncBlocklyTheme();
	});
}

function setStatus(text, kind, meta) {
	statusEl.className = kind ?? "";
	statusLine.textContent = text;
	const oldMeta = statusEl.querySelector(".meta");
	if (oldMeta) oldMeta.remove();
	if (meta) {
		const m = document.createElement("span");
		m.className = "meta";
		m.textContent = meta;
		statusEl.appendChild(m);
	}
}

function seqForChain(ids) {
	const seq = [];
	for (const id of ids) {
		const preset = presetsById.get(id);
		if (!preset) return null;
		seq.push(preset.seq[0]);
	}
	return seq;
}

function refreshBuild() {
	if (mode !== "build" || !workspace) return;
	const chains = topLevelChains(workspace);
	if (chains.length === 0) {
		setStatus("Drag a morpheme block in to begin.", "");
		lastBuildSeq = null;
		updateReadingLine(null);
		return;
	}
	if (chains.length > 1) {
		setStatus("More than one stack on the canvas — combine into a single stack.", "error");
		lastBuildSeq = null;
		updateReadingLine(null);
		return;
	}
	const ids = chains[0];
	const seq = seqForChain(ids);
	if (!seq) {
		setStatus("Unknown morpheme in stack.", "error");
		lastBuildSeq = null;
		updateReadingLine(null);
		return;
	}
	const result = buildWord(seq);
	if (!result.ok) {
		setStatus(`✗ ${result.reason || "invalid sequence"}`, "error", `at position ${result.errorAt >= 0 ? result.errorAt + 1 : "?"}`);
		lastBuildSeq = null;
		updateReadingLine(null);
		return;
	}
	const prefix = result.approximate ? "≈ " : "";
	const kind = result.approximate ? "approx" : "ok";
	setStatus(`${prefix}${result.word}`, kind, result.closed ? "complete word" : "mid-derivation — keep building");
	lastBuildSeq = seq;
	updateReadingLine(seq);
}

function rerenderBreakdown() {
	if (!lastDeconstructSeq) return;
	renderBreakdown(breakdownDiv, lastDeconstructWord, lastDeconstructSeq, lastDeconstructBuilt, glossSummaryItems, { reverseOrder: readLastFirst() });
}

async function runDeconstruct() {
	const word = wordInput.value.trim();
	if (!word) return;
	if (deconstructAbort) deconstructAbort.abort();
	deconstructAbort = new AbortController();
	breakdownDiv.innerHTML = "";
	moveToBuilderBtn.hidden = true;
	lastDeconstructIds = null;
	lastDeconstructSeq = null;
	setStatus(`Analyzing "${word}"…`, "");
	try {
		const result = await analyzeWordAsync(word, presets, {}, { signal: deconstructAbort.signal });
		if (!result.matches || result.matches.length === 0) {
			setStatus(`No verified breakdown found for "${word}".`, "error", `${result.evalCount} candidates checked`);
			return;
		}
		const best = result.matches[0];
		const built = buildWord(best.seq);
		lastDeconstructWord = word;
		lastDeconstructSeq = best.seq;
		lastDeconstructBuilt = built;
		rerenderBreakdown();
		lastDeconstructIds = best.seq.map((item) => item.id).filter(Boolean);
		moveToBuilderBtn.hidden = false;
		setStatus(`${result.matches.length} verified breakdown(s) found`, "ok");
	} catch (err) {
		if (err?.name === "AbortError") return;
		setStatus(`Analysis failed: ${err.message}`, "error");
	}
}

function moveToBuilder() {
	if (!lastDeconstructIds) return;
	const ids = lastDeconstructIds;
	setMode("build");
	Blockly.svgResize(workspace);
	renderChain(workspace, ids, presetsById, showIds());
	workspace.scrollCenter(); // the toolbox otherwise covers a stack placed at the workspace's default (20, 20) origin
	refreshBuild();
}

// --- Palette hide/show (bl-oq-ly#8) and filter (bl-oq-ly#9). The toolbox
// content is rebuilt from the filtered preset list rather than hidden/shown
// per-block, so a category with no matches disappears entirely (see
// blocks.js's buildToolbox) instead of leaving an empty, confusing category
// behind. Hiding the palette uses Toolbox.setVisible(), Blockly's own public
// API for this -- NOT workspace.updateToolbox(null), which throws ("Can't
// nullify an existing toolbox"): updateToolbox only supports swapping a
// toolbox's *content*, never removing one already injected with a toolbox.
function closeOpenFlyout() {
	workspace?.getToolbox()?.getFlyout()?.hide();
}

function applyToolbox() {
	if (!workspace) return;
	workspace.getToolbox()?.setVisible(paletteVisible);
	closeOpenFlyout();
	if (!paletteVisible) return;

	const q = filterInput.value.trim().toLowerCase();
	const filtered = q
		? presets.filter((p) => p.id.toLowerCase().includes(q) || (p.glossShort || p.gloss || "").toLowerCase().includes(q))
		: presets;
	// Rebuilt every time from scratch (no cached "full" toolbox), since
	// showIds() can change independently of the filter and both need to be
	// reflected together.
	workspace.updateToolbox(buildToolbox(filtered, showIds()));
	closeOpenFlyout();
}

function setMode(next) {
	mode = next;
	modeBuildBtn.classList.toggle("active", next === "build");
	modeBuildBtn.setAttribute("aria-selected", String(next === "build"));
	modeDeconstructBtn.classList.toggle("active", next === "deconstruct");
	modeDeconstructBtn.setAttribute("aria-selected", String(next === "deconstruct"));
	panelBuild.classList.toggle("active", next === "build");
	panelDeconstruct.classList.toggle("active", next === "deconstruct");
	blocklyDiv.hidden = next !== "build";
	breakdownDiv.hidden = next !== "deconstruct";

	if (next === "build") {
		requestAnimationFrame(() => Blockly.svgResize(workspace));
		refreshBuild();
	} else {
		breakdownDiv.innerHTML = "";
		moveToBuilderBtn.hidden = true;
		updateReadingLine(null);
		setStatus("Type a word and press Deconstruct.", "");
	}
}

async function main() {
	blocklyThemes = buildBlocklyThemes();
	initTheme();
	initDisplayOptions();
	setStatus("Loading morpheme catalog…", "");
	const catalog = await loadCatalog();
	presets = catalog.presets;
	presetsById = new Map(presets.map((p) => [p.id, p]));

	defineMorphemeBlocks();

	workspace = Blockly.inject(blocklyDiv, {
		toolbox: buildToolbox(presets, showIds()),
		theme: isEffectivelyDark() ? blocklyThemes.dark : blocklyThemes.light,
		trashcan: true,
		zoom: { controls: true, wheel: true },
		move: { scrollbars: true, drag: true, wheel: true },
	});
	workspace.addChangeListener(() => refreshBuild());
	window.addEventListener("resize", () => Blockly.svgResize(workspace));
	window.addEventListener("orientationchange", () => Blockly.svgResize(workspace));

	const authNote = catalog.authoritative === false ? " (grammarian data is hand-authored, not yet dictionary-verified — see its own CLAUDE.md)" : "";
	setStatus(`Loaded ${presets.length} morphemes.${authNote}`, "");

	modeBuildBtn.addEventListener("click", () => setMode("build"));
	modeDeconstructBtn.addEventListener("click", () => setMode("deconstruct"));
	analyzeBtn.addEventListener("click", runDeconstruct);
	wordInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") runDeconstruct();
	});
	moveToBuilderBtn.addEventListener("click", moveToBuilder);

	paletteToggleBtn.addEventListener("click", () => {
		paletteVisible = !paletteVisible;
		paletteToggleBtn.textContent = paletteVisible ? "Hide palette" : "Show palette";
		filterInput.hidden = !paletteVisible;
		applyToolbox();
		requestAnimationFrame(() => Blockly.svgResize(workspace));
	});
	filterInput.addEventListener("input", applyToolbox);
}

main().catch((err) => {
	console.error(err);
	setStatus(`Failed to start: ${err.message}`, "error");
});
