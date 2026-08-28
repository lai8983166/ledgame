import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const preload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
const globalDialog = await readFile(new URL("../src/components/GameGlobalConfigDialog.vue", import.meta.url), "utf8");
const infoDialog = await readFile(new URL("../src/components/GameInfoEditDialog.vue", import.meta.url), "utf8");

test("touch preload resynchronizes editable focus when the native window regains focus", () => {
  assert.match(preload, /window\.addEventListener\(['"]focus['"][\s\S]*reportEditableFocus\(document\.activeElement\)/);
});

test("parent dialogs ignore every keyboard event while their media picker is on top", () => {
  assert.match(globalDialog, /function handleKeydown\(event\) \{\s*if \(picker\.value\) \{\s*return;/);
  assert.match(infoDialog, /function handleKeydown\(event\) \{\s*if \(pickerOpen\.value\) \{\s*return;/);
});
