import { build } from "esbuild";

await build({
	entryPoints: ["tools/vendor-entry.js"],
	bundle: true,
	format: "iife",
	globalName: "BlOqLyBlocklyBundle",
	outfile: "docs/vendor/blockly.js",
	logLevel: "info",
	legalComments: "eof",
});
