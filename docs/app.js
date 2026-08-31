import { buildWord, analyzeWordAsync, glossSummary } from "./oq-api.js";
import { loadCatalog } from "./catalog.js";
import { defineMorphemeBlock, buildToolbox, topLevelChains } from "./blocks.js";
import { renderBreakdown } from "./breakdown.js";

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

let mode = "build";
let presets = [];
let presetsById = new Map();
let toolbox = null;
let workspace = null;
let deconstructAbort = null;

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
		return;
	}
	if (chains.length > 1) {
		setStatus("More than one stack on the canvas — combine into a single stack.", "error");
		return;
	}
	const ids = chains[0];
	const seq = seqForChain(ids);
	if (!seq) {
		setStatus("Unknown morpheme in stack.", "error");
		return;
	}
	const result = buildWord(seq);
	if (!result.ok) {
		setStatus(`✗ ${result.reason || "invalid sequence"}`, "error", `at position ${result.errorAt >= 0 ? result.errorAt + 1 : "?"}`);
		return;
	}
	const prefix = result.approximate ? "≈ " : "";
	const kind = result.approximate ? "approx" : "ok";
	setStatus(`${prefix}${result.word}`, kind, result.closed ? "complete word" : "mid-derivation — keep building");
}

async function runDeconstruct() {
	const word = wordInput.value.trim();
	if (!word) return;
	if (deconstructAbort) deconstructAbort.abort();
	deconstructAbort = new AbortController();
	breakdownDiv.innerHTML = "";
	setStatus(`Analyzing "${word}"…`, "");
	try {
		const result = await analyzeWordAsync(word, presets, {}, { signal: deconstructAbort.signal });
		if (!result.matches || result.matches.length === 0) {
			setStatus(`No verified breakdown found for "${word}".`, "error", `${result.evalCount} candidates checked`);
			return;
		}
		const best = result.matches[0];
		const built = buildWord(best.seq);
		renderBreakdown(breakdownDiv, word, best.seq, built, glossSummary);
		setStatus(`${result.matches.length} verified breakdown(s) found`, "ok");
	} catch (err) {
		if (err?.name === "AbortError") return;
		setStatus(`Analysis failed: ${err.message}`, "error");
	}
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
		workspace.clear();
		requestAnimationFrame(() => Blockly.svgResize(workspace));
		setStatus("Drag a morpheme block in to begin.", "");
	} else {
		breakdownDiv.innerHTML = "";
		setStatus("Type a word and press Deconstruct.", "");
	}
}

async function main() {
	setStatus("Loading morpheme catalog…", "");
	const catalog = await loadCatalog();
	presets = catalog.presets;
	presetsById = new Map(presets.map((p) => [p.id, p]));

	defineMorphemeBlock();
	toolbox = buildToolbox(presets);

	workspace = Blockly.inject(blocklyDiv, {
		toolbox,
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
}

main().catch((err) => {
	console.error(err);
	setStatus(`Failed to start: ${err.message}`, "error");
});
