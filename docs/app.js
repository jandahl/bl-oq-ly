import { buildWord, analyzeWordAsync, glossSummaryItems, resolveMoodLabel, resolvePersonLabel } from "./oq-api.js";
import { loadCatalog } from "./catalog.js";
import {
	defineMorphemeBlocks, buildToolbox, topLevelChains, renderChain, relabelBlocks,
	buildVerbEndingIndex, defineVerbEndingPickerBlock, defineVerbObjectBlock, registerVerbPickerReactivity,
	presetMatchesQuery,
} from "./blocks.js";
import { renderBreakdown, renderAlternativeBreakdowns } from "./breakdown.js";
import { buildBlocklyThemes } from "./theme.js";
import { composedTranslation } from "./gloss.js";
import { readState, writeState } from "./router.js";
import { loadWorkedExamples } from "./worked-examples.js";

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
const blocklyThemeSelect = document.getElementById("blockly-theme-select");
const moveToBuilderBtn = document.getElementById("move-to-builder-btn");
const exampleWordButtons = document.querySelectorAll("[data-example-word]");
const workedExamplesBtn = document.getElementById("worked-examples-btn");
const workedExamplesModal = document.getElementById("worked-examples-modal");
const workedExamplesClose = document.getElementById("worked-examples-close");
const workedExamplesFilter = document.getElementById("worked-examples-filter");
const workedExamplesStatus = document.getElementById("worked-examples-status");
const workedExamplesList = document.getElementById("worked-examples-list");
const showIdsCheckbox = document.getElementById("opt-show-ids");
const readingOrderCheckbox = document.getElementById("opt-reading-order");
const langSelect = document.getElementById("opt-lang");
const spellingSelect = document.getElementById("opt-spelling");
const readingLine = document.getElementById("reading-line");

let mode = "build";
let presets = [];
let presetsById = new Map();
let workspace = null;
let deconstructAbort = null;
let deconstructRun = 0;
let paletteVisible = true;
let lastDeconstructIds = null;
let blocklyThemes = null;
let lastDeconstructWord = "";
let lastDeconstructSeq = null;
let lastDeconstructBuilt = null;
let lastDeconstructAlternatives = null;
let selectedBlocklyTheme = "classic";
let workedExamples = [];

// --- Display options (bl-oq-ly#10, #11, #17), persisted like the theme.
// `displayOptions()` is the single source of truth passed into every
// labelFor()-consuming call (blocks.js's buildToolbox/renderChain/
// relabelBlocks, breakdown.js/gloss.js's glossSummaryItems lang) so all of
// them stay in sync with each other -- the earlier "hiding ids also hid the
// spelling" bug (bl-oq-ly#14) came from exactly this kind of state living in
// two places instead of one.
const SHOW_IDS_KEY = "bl-oq-ly:show-ids";
const READING_ORDER_KEY = "bl-oq-ly:reading-order";
const LANG_KEY = "bl-oq-ly:lang";
const SPELLING_KEY = "bl-oq-ly:spelling-mode";

function displayOptions() {
	return { showIds: showIdsCheckbox.checked, lang: langSelect.value, spellingMode: spellingSelect.value };
}

function selectExample(word) {
	setMode("deconstruct");
	wordInput.value = word;
	runDeconstruct();
}

function renderWorkedExamples() {
	const query = workedExamplesFilter.value.trim().toLowerCase();
	const matches = workedExamples.filter((example) =>
		!query || `${example.surface} ${example.gloss ?? ""}`.toLowerCase().includes(query));
	workedExamplesStatus.textContent = `${matches.length} of ${workedExamples.length} examples`;
	workedExamplesList.replaceChildren(...matches.map((example) => {
		const button = document.createElement("button");
		button.type = "button";
		button.dataset.exampleWord = example.surface;
		button.textContent = example.gloss ? `${example.surface} — ${example.gloss}` : example.surface;
		if (example.gloss) button.title = example.gloss;
		return button;
	}));
}

async function openWorkedExamples() {
	workedExamplesModal.showModal();
	if (workedExamples.length) return;
	workedExamplesStatus.textContent = "Loading examples…";
	try {
		workedExamples = await loadWorkedExamples();
		renderWorkedExamples();
	} catch (err) {
		workedExamplesStatus.textContent = `Could not load the CI example set: ${err.message}`;
	}
}

function readLastFirst() {
	return readingOrderCheckbox.checked;
}

function initDisplayOptions() {
	showIdsCheckbox.checked = localStorage.getItem(SHOW_IDS_KEY) === "true";
	readingOrderCheckbox.checked = localStorage.getItem(READING_ORDER_KEY) !== "false"; // default on
	langSelect.value = localStorage.getItem(LANG_KEY) === "da" ? "da" : "en";
	spellingSelect.value = ["both", "spelling-only", "gloss-only"].includes(localStorage.getItem(SPELLING_KEY))
		? localStorage.getItem(SPELLING_KEY) : "both";

	function onDisplayOptionChange() {
		if (workspace) relabelBlocks(workspace, presetsById, displayOptions());
		applyToolbox();
		refreshBuild();
		if (lastDeconstructIds) rerenderBreakdown();
	}
	showIdsCheckbox.addEventListener("change", () => {
		localStorage.setItem(SHOW_IDS_KEY, String(showIdsCheckbox.checked));
		onDisplayOptionChange();
	});
	langSelect.addEventListener("change", () => {
		localStorage.setItem(LANG_KEY, langSelect.value);
		onDisplayOptionChange();
	});
	spellingSelect.addEventListener("change", () => {
		localStorage.setItem(SPELLING_KEY, spellingSelect.value);
		onDisplayOptionChange();
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
	readingLine.textContent = composedTranslation(glossSummaryItems(seq, { lang: displayOptions().lang }));
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
	if (workspace && blocklyThemes) {
		const themeSet = blocklyThemes[selectedBlocklyTheme] || blocklyThemes.classic;
		workspace.setTheme(isEffectivelyDark() ? themeSet.dark : themeSet.light);
	}
}

function initBlocklyTheme() {
	const stored = localStorage.getItem("bl-oq-ly:blockly-theme");
	selectedBlocklyTheme = ["classic", "zelos"].includes(stored) ? stored : "classic";
	blocklyThemeSelect.value = selectedBlocklyTheme;
	blocklyThemeSelect.addEventListener("change", () => {
		selectedBlocklyTheme = blocklyThemeSelect.value;
		localStorage.setItem("bl-oq-ly:blockly-theme", selectedBlocklyTheme);
		rebuildWorkspace();
	});
}

function workspaceOptions() {
	const themeSet = blocklyThemes[selectedBlocklyTheme] || blocklyThemes.classic;
	return {
		toolbox: buildToolbox(presets, displayOptions()),
		theme: isEffectivelyDark() ? themeSet.dark : themeSet.light,
		// Classic uses Blockly's default renderer (Geras); Zelos is a renderer,
		// not just a Theme. Changing it requires rebuilding the workspace.
		renderer: selectedBlocklyTheme === "zelos" ? "zelos" : "geras",
		trashcan: true,
		zoom: { controls: true, wheel: true, pinch: true },
		sounds: false,
		move: { scrollbars: true, drag: true, wheel: true },
	};
}

function injectWorkspace(serializedState = null) {
	workspace = Blockly.inject(blocklyDiv, workspaceOptions());
	workspace.addChangeListener(() => refreshBuild());
	if (serializedState) Blockly.serialization.workspaces.load(serializedState, workspace);
	registerVerbPickerReactivity(workspace);
}

function rebuildWorkspace() {
	if (!workspace) return;
	const serializedState = Blockly.serialization.workspaces.save(workspace);
	workspace.dispose();
	injectWorkspace(serializedState);
	applyToolbox();
	requestAnimationFrame(() => Blockly.svgResize(workspace));
	refreshBuild();
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
	statusEl.hidden = false;
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

// --- Shareable-link state (router.js). Both tabs' content live in the URL
// together -- Build's chain AND Deconstruct's word -- so switching tabs
// never drops the other side. Build's canvas still replaceState-syncs on
// every change (too frequent for real history entries); mode switches and
// a successful Deconstruct push a real history entry.
function currentShareState() {
	const chains = workspace ? topLevelChains(workspace) : [];
	const word = lastDeconstructWord || wordInput.value.trim();
	return {
		mode,
		word,
		chain: chains.length === 1 ? chains[0] : [],
	};
}

function syncURL({ push = false } = {}) {
	const url = location.pathname + writeState(currentShareState()) + location.hash;
	if (push) history.pushState(null, "", url);
	else history.replaceState(null, "", url);
}

/** Applies a {mode, word, chain} state (from router.js's readState(),
 * whether from the initial load or a popstate) to the live app -- the
 * inverse of currentShareState(). Restores BOTH tabs, then shows the one
 * `mode` names, so a round-trip through the other tab cannot blank the
 * one you left. Never itself touches the URL (the caller already has it,
 * or is about to set it). */
function applyShareState(state) {
	if (state.word) {
		wordInput.value = state.word;
		if (!lastDeconstructWord) lastDeconstructWord = state.word;
	}
	if (state.chain.length > 0 && workspace) {
		const current = topLevelChains(workspace);
		const same = current.length === 1 && current[0].length === state.chain.length
			&& current[0].every((id, i) => id === state.chain[i]);
		if (!same) {
			renderChain(workspace, state.chain, presetsById, displayOptions());
			workspace.scrollCenter();
		}
	}
	setMode(state.mode, { sync: false });
	if (state.mode === "deconstruct" && state.word) {
		if (lastDeconstructWord !== state.word || !lastDeconstructSeq) runDeconstruct();
	} else if (state.mode === "build") {
		refreshBuild();
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
	// Keeps Build's link current with the canvas on every change -- cheap
	// (replaceState, no history entry) and correct regardless of which
	// early-return below fires, since the chain itself is already final by
	// this point (topLevelChains() just read it) even when buildWord() goes
	// on to reject it.
	syncURL({ push: false });
	const chains = topLevelChains(workspace);
	if (chains.length === 0) {
		setStatus("Drag a morpheme block in to begin.", "");
		updateReadingLine(null);
		return;
	}
	if (chains.length > 1) {
		setStatus("More than one stack on the canvas — combine into a single stack.", "error");
		updateReadingLine(null);
		return;
	}
	const ids = chains[0];
	const seq = seqForChain(ids);
	if (!seq) {
		setStatus("Unknown morpheme in stack.", "error");
		updateReadingLine(null);
		return;
	}
	const result = buildWord(seq);
	if (!result.ok) {
		setStatus(`✗ ${result.reason || "invalid sequence"}`, "error", `at position ${result.errorAt >= 0 ? result.errorAt + 1 : "?"}`);
		updateReadingLine(null);
		return;
	}
	const prefix = result.approximate ? "≈ " : "";
	const kind = result.approximate ? "approx" : "ok";
	setStatus(`${prefix}${result.word}`, kind, result.closed ? "complete word" : "mid-derivation — keep building");
	updateReadingLine(seq);
}

function rerenderBreakdown() {
	if (!lastDeconstructSeq) return;
	breakdownDiv.innerHTML = "";
	const primary = document.createElement("article");
	primary.id = "primary-breakdown";
	renderBreakdown(primary, lastDeconstructWord, lastDeconstructSeq, lastDeconstructBuilt, glossSummaryItems, {
		reverseOrder: readLastFirst(),
		lang: displayOptions().lang,
	});
	breakdownDiv.appendChild(primary);
	renderAlternativeBreakdowns(breakdownDiv, lastDeconstructAlternatives, glossSummaryItems, {
		word: lastDeconstructWord,
		reverseOrder: readLastFirst(),
		lang: displayOptions().lang,
		builderHref: (seq) => `${location.pathname}${writeState({ mode: "build", chain: seq.map((item) => item.id).filter(Boolean) })}`,
	});
}

async function runDeconstruct() {
	const word = wordInput.value.trim();
	if (deconstructAbort) deconstructAbort.abort();
	const run = ++deconstructRun;
	if (!word) return;
	deconstructAbort = new AbortController();
	if (mode === "deconstruct") {
		breakdownDiv.innerHTML = "";
		moveToBuilderBtn.hidden = true;
		setStatus(`Analyzing "${word}"…`, "");
	}
	lastDeconstructIds = null;
	lastDeconstructSeq = null;
	lastDeconstructAlternatives = null;
	try {
		const result = await analyzeWordAsync(word, presets, {}, { signal: deconstructAbort.signal });
		// AbortController is advisory: an upstream implementation may still
		// resolve after abort. Never let that stale result replace a newer
		// analysis. A completed result IS stored even if the learner switched
		// to Build mid-flight, so returning to Deconstruct still has it.
		if (run !== deconstructRun) return;
		if (!result.matches || result.matches.length === 0) {
			if (mode === "deconstruct") {
				setStatus(`No verified breakdown found for "${word}".`, "error", `${result.evalCount} candidates checked`);
			}
			return;
		}
		const analyzed = result.matches.map((match) => ({ seq: match.seq, built: buildWord(match.seq) }));
		const best = analyzed[0];
		lastDeconstructWord = word;
		lastDeconstructSeq = best.seq;
		lastDeconstructBuilt = best.built;
		lastDeconstructAlternatives = analyzed.slice(1);
		lastDeconstructIds = best.seq.map((item) => item.id).filter(Boolean);
		if (mode === "deconstruct") {
			rerenderBreakdown();
			moveToBuilderBtn.hidden = false;
			statusEl.hidden = true;
			saveDeconstructStatus();
			// A verified result is the share-worthy moment -- not every keystroke,
			// and not a failed/no-match attempt (see currentShareState()'s use of
			// lastDeconstructWord rather than the live input value).
			syncURL({ push: true });
		} else {
			syncURL({ push: false });
		}
	} catch (err) {
		if (err?.name === "AbortError" || run !== deconstructRun) return;
		if (mode === "deconstruct") setStatus(`Analysis failed: ${err.message}`, "error");
	}
}

function moveToBuilder() {
	if (!lastDeconstructIds) return;
	const ids = lastDeconstructIds;
	setMode("build");
	Blockly.svgResize(workspace);
	renderChain(workspace, ids, presetsById, displayOptions());
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
		? presets.filter((preset) => presetMatchesQuery(preset, q))
		: presets;
	// Rebuilt every time from scratch (no cached "full" toolbox), since
	// display options can change independently of the filter and both need
	// to be reflected together. The verb ending picker has no id/gloss text
	// to match a query, so it's excluded from a filtered view entirely
	// (bl-oq-ly#18) rather than left showing as an always-present,
	// unrelated "Inflectional endings (1)" category.
	workspace.updateToolbox(buildToolbox(filtered, displayOptions(), { includeVerbPicker: !q }));
	closeOpenFlyout();
}

let savedDeconstructStatus = null;

function saveDeconstructStatus() {
	savedDeconstructStatus = {
		hidden: statusEl.hidden,
		text: statusLine.textContent,
		kind: statusEl.className,
		meta: statusEl.querySelector(".meta")?.textContent ?? null,
	};
}

function restoreDeconstructStatus() {
	if (!savedDeconstructStatus) {
		setStatus("Type a word and press Deconstruct.", "");
		return;
	}
	if (savedDeconstructStatus.hidden) {
		statusEl.hidden = true;
		return;
	}
	setStatus(savedDeconstructStatus.text, savedDeconstructStatus.kind, savedDeconstructStatus.meta);
}

function setMode(next, { sync = true } = {}) {
	// Clicking the already-selected tab is a no-op. Previously this path still
	// ran the Deconstruct-entry reset below, so a second click on Deconstruct
	// wiped a finished analysis.
	if (mode === next) return;

	// Do not abort or invalidate an in-flight analysis just for leaving the
	// tab -- a result that finishes while Build is showing is stored and
	// waiting when the learner comes back. closeOpenFlyout only, so a
	// leftover toolbox overlay doesn't sit on Deconstruct.
	if (mode === "build" && next !== "build") {
		closeOpenFlyout();
	}
	if (mode === "deconstruct") {
		saveDeconstructStatus();
	}

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
	} else if (lastDeconstructSeq) {
		// Restore the last verified breakdown instead of blanking the tab.
		// The DOM is left intact across switches; this only un-hides it and
		// puts the status line back the way a completed analysis left it.
		if (lastDeconstructWord) wordInput.value = lastDeconstructWord;
		moveToBuilderBtn.hidden = !lastDeconstructIds;
		updateReadingLine(null);
		if (!breakdownDiv.innerHTML) rerenderBreakdown();
		statusEl.hidden = true;
	} else {
		moveToBuilderBtn.hidden = true;
		updateReadingLine(null);
		restoreDeconstructStatus();
	}
	// sync:false when applyShareState() is driving this (initial load or a
	// popstate) -- the URL either already matches (we just navigated there)
	// or is about to be set by whatever applyShareState() does next
	// (runDeconstruct()'s own syncURL(), or renderChain()+refreshBuild()'s),
	// so pushing here too would create a redundant/premature history entry.
	if (sync) syncURL({ push: true });
}

async function main() {
	blocklyThemes = buildBlocklyThemes();
	initTheme();
	initBlocklyTheme();
	initDisplayOptions();
	setStatus("Loading morpheme catalog…", "");
	const catalog = await loadCatalog();
	presets = catalog.presets;
	presetsById = new Map(presets.map((p) => [p.id, p]));

	defineMorphemeBlocks();
	const verbEndingIndex = buildVerbEndingIndex(presets);
	defineVerbEndingPickerBlock(verbEndingIndex, presetsById, displayOptions, resolveMoodLabel, resolvePersonLabel);
	defineVerbObjectBlock(verbEndingIndex, resolvePersonLabel);

	injectWorkspace();
	window.addEventListener("resize", () => Blockly.svgResize(workspace));
	window.addEventListener("orientationchange", () => Blockly.svgResize(workspace));

	const authNote = catalog.authoritative === false ? " (grammarian data is hand-authored, not yet dictionary-verified — see its own CLAUDE.md)" : "";
	setStatus(`Loaded ${presets.length} morphemes.${authNote}`, "");

	modeBuildBtn.addEventListener("click", () => setMode("build"));
	modeDeconstructBtn.addEventListener("click", () => setMode("deconstruct"));
	analyzeBtn.addEventListener("click", runDeconstruct);
	for (const button of exampleWordButtons) {
		button.addEventListener("click", () => selectExample(button.dataset.exampleWord));
	}
	workedExamplesBtn.addEventListener("click", openWorkedExamples);
	workedExamplesClose.addEventListener("click", () => workedExamplesModal.close());
	workedExamplesFilter.addEventListener("input", renderWorkedExamples);
	workedExamplesList.addEventListener("click", (event) => {
		const button = event.target.closest("button[data-example-word]");
		if (!button) return;
		workedExamplesModal.close();
		selectExample(button.dataset.exampleWord);
	});
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

	// Shareable links (router.js): restore whatever the page was loaded with
	// -- a bare "/" degrades to today's plain default (build mode, empty
	// canvas), same as before this feature existed. Back/Forward then just
	// replays the same restore against each history entry's own URL.
	// A bare "/" (nothing to restore) is left alone entirely -- applyShareState
	// would otherwise still run setMode("build")'s own refreshBuild(), which
	// immediately overwrites the "Loaded N morphemes" confirmation above with
	// "Drag a morpheme block in to begin." for no reason connected to a link.
	const initialState = readState(location.search);
	if (initialState.mode !== "build" || initialState.word || initialState.chain.length > 0) applyShareState(initialState);
	window.addEventListener("popstate", () => applyShareState(readState(location.search)));
}

main().catch((err) => {
	console.error(err);
	setStatus(`Failed to start: ${err.message}`, "error");
});
