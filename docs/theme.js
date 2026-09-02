// Blockly light/dark themes, built via Blockly's own supported theming API
// (Blockly.Theme + componentStyles) rather than guessing at Blockly's
// internal CSS class names, which aren't a stable public contract across
// versions. workspace.setTheme() lets app.js swap between these live when
// the page's own theme toggle changes, without re-injecting the workspace.
//
// This replaces an earlier blanket `color: #1c1a16` CSS override on
// #blockly-div's whole subtree, which forced Blockly's toolbox text dark
// unconditionally — readable, but meant Blockly's own chrome could never
// actually go dark to match a real dark-mode toggle (bl-oq-ly#7).

import { WORD_CLASS_THEMES, getWordClassColors } from "./oq-api.js";

// oq's public API owns the canonical word-class palette. Blockly uses the
// medium `border` tone as its solid block/category colour because oq's `fill`
// is intentionally a very pale/dark card background; using it as a solid
// Blockly block would make Blockly's white field text illegible in the light
// theme. Shadow and edge rendering still use the same API colour triple.
const OQ_STYLE_PATHS = {
	oq_nominal: ["nominal_root"],
	oq_verbal: ["verbal_root"],
	oq_derivational: ["derivational_affix"],
	oq_inflectional: ["inflectional_affix"],
	oq_enclitic: ["enclitic"],
	oq_neutral: [],
	oq_container: [],
};

/** Blockly 12 rejects CSS hsl() strings, while oq's canonical API returns
 * exactly that format. Convert only the representation at this boundary;
 * the colour coordinates themselves remain API-owned. */
function blocklyColour(hsl) {
	const match = /^hsl\((-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)%,(\d+(?:\.\d+)?)%\)$/.exec(hsl);
	if (!match) return hsl;
	const hue = ((Number(match[1]) % 360) + 360) % 360;
	const saturation = Number(match[2]) / 100;
	const lightness = Number(match[3]) / 100;
	const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
	const offset = lightness - chroma / 2;
	let rgb;
	if (hue < 60) rgb = [chroma, x, 0];
	else if (hue < 120) rgb = [x, chroma, 0];
	else if (hue < 180) rgb = [0, chroma, x];
	else if (hue < 240) rgb = [0, x, chroma];
	else if (hue < 300) rgb = [x, 0, chroma];
	else rgb = [chroma, 0, x];
	return `#${rgb.map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function oqBlocklyStyles(oqTheme) {
	const blockStyles = {};
	const categoryStyles = {};
	for (const [name, path] of Object.entries(OQ_STYLE_PATHS)) {
		const colours = getWordClassColors(path, oqTheme);
		blockStyles[`${name}_blocks`] = {
			colourPrimary: blocklyColour(colours.border),
			colourSecondary: blocklyColour(colours.fill),
			colourTertiary: blocklyColour(colours.text),
		};
		categoryStyles[`${name}_category`] = { colour: blocklyColour(colours.border) };
	}
	return { blockStyles, categoryStyles };
}

function defineTheme(name, base, componentStyles, oqTheme) {
	return Blockly.Theme.defineTheme(name, { base, componentStyles, ...oqBlocklyStyles(oqTheme) });
}

export function buildBlocklyThemes() {
	const lightStyles = {
		workspaceBackgroundColour: "#ffffff",
		toolboxBackgroundColour: "#f7f5f0",
		toolboxForegroundColour: "#1c1a16",
		flyoutBackgroundColour: "#f0ede4",
		flyoutForegroundColour: "#1c1a16",
		flyoutOpacity: 1,
		scrollbarColour: "#c9c2b0",
		insertionMarkerColour: "#2a6f6f",
		insertionMarkerOpacity: 0.3,
	};
	const darkStyles = {
		workspaceBackgroundColour: "#1f2224",
		toolboxBackgroundColour: "#16181a",
		toolboxForegroundColour: "#ece7dd",
		flyoutBackgroundColour: "#26292b",
		flyoutForegroundColour: "#ece7dd",
		flyoutOpacity: 1,
		scrollbarColour: "#5fb8b8",
		insertionMarkerColour: "#5fb8b8",
		insertionMarkerOpacity: 0.3,
	};

	const classic = {
		light: defineTheme("bl-oq-ly-classic-light", Blockly.Themes.Classic, lightStyles, WORD_CLASS_THEMES.light),
		dark: defineTheme("bl-oq-ly-classic-dark", Blockly.Themes.Classic, darkStyles, WORD_CLASS_THEMES.default),
	};
	const zelos = {
		light: defineTheme("bl-oq-ly-zelos-light", Blockly.Themes.Zelos, lightStyles, WORD_CLASS_THEMES.light),
		dark: defineTheme("bl-oq-ly-zelos-dark", Blockly.Themes.Zelos, darkStyles, WORD_CLASS_THEMES.default),
	};

	return { classic, zelos, light: classic.light, dark: classic.dark };
}
