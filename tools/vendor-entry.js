import * as Blockly from "blockly";
import "blockly/blocks";
import "blockly/msg/en";

// The application predates ES-module loading for Blockly and intentionally
// uses the global Blockly namespace. Keep that boundary in this tiny,
// generated bundle so the rest of the app does not need a broad migration.
globalThis.Blockly = Blockly;
