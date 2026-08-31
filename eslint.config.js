// Flat ESLint config (ESLint 9+). Deliberately correctness-focused, not
// stylistic — no indent/quote-style rules, so this never fights the existing
// code's own formatting. The point is catching the kind of bug this repo has
// actually shipped (an unused import after a refactor, a typo'd variable
// name, a dead code path), not enforcing a house style.

const browserGlobals = {
	window: "readonly",
	document: "readonly",
	fetch: "readonly",
	localStorage: "readonly",
	sessionStorage: "readonly",
	requestAnimationFrame: "readonly",
	AbortController: "readonly",
	console: "readonly",
	// Loaded globally via <script> tags in index.html (blockly_compressed.js
	// etc.), never imported — see docs/blocks.js's/theme.js's own comments on
	// why this can't be a normal ES import.
	Blockly: "readonly",
};

const nodeGlobals = {
	process: "readonly",
	console: "readonly",
	global: "readonly",
	URL: "readonly",
};

export default [
	{
		files: ["docs/**/*.js"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: browserGlobals,
		},
		rules: {
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"no-undef": "error",
			"no-unreachable": "error",
			"no-dupe-keys": "error",
			"no-dupe-args": "error",
			"no-const-assign": "error",
			"no-import-assign": "error",
			"no-fallthrough": "error",
			eqeqeq: ["error", "smart"],
		},
	},
	{
		files: ["test/**/*.js", "eslint.config.js", "playwright.config.js"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: { ...browserGlobals, ...nodeGlobals },
		},
		rules: {
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"no-undef": "error",
		},
	},
];
