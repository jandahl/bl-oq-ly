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

export function buildBlocklyThemes() {
	const light = Blockly.Theme.defineTheme("bl-oq-ly-light", {
		base: Blockly.Themes.Classic,
		componentStyles: {
			workspaceBackgroundColour: "#ffffff",
			toolboxBackgroundColour: "#f7f5f0",
			toolboxForegroundColour: "#1c1a16",
			flyoutBackgroundColour: "#f0ede4",
			flyoutForegroundColour: "#1c1a16",
			flyoutOpacity: 1,
			scrollbarColour: "#c9c2b0",
			insertionMarkerColour: "#2a6f6f",
			insertionMarkerOpacity: 0.3,
		},
	});

	const dark = Blockly.Theme.defineTheme("bl-oq-ly-dark", {
		base: Blockly.Themes.Classic,
		componentStyles: {
			workspaceBackgroundColour: "#1f2224",
			toolboxBackgroundColour: "#16181a",
			toolboxForegroundColour: "#ece7dd",
			flyoutBackgroundColour: "#26292b",
			flyoutForegroundColour: "#ece7dd",
			flyoutOpacity: 1,
			scrollbarColour: "#5fb8b8",
			insertionMarkerColour: "#5fb8b8",
			insertionMarkerOpacity: 0.3,
		},
	});

	return { light, dark };
}
