import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { restoreRendererFocus } from "../src/lib/rendererFocus.js";

const viewPaths = [
  "../src/views/DatabaseRefreshView.vue",
  "../src/views/LedGameTouchView.vue",
  "../src/views/RankGameEditorView.vue",
  "../src/views/SimpleGameEditorView.vue",
  "../src/views/SpiritLibraryView.vue",
];

test("operation completion preserves current input without native activation or delayed blur", async () => {
  const calls = [];
  const activeElement = { isConnected: true, focus: options => calls.push(options),
    blur: () => assert.fail('must not remove current input focus') };
  const targetWindow = {
    focus: () => assert.fail('must not activate a native window'),
    document: { activeElement, hasFocus: () => true },
    ledGame: { restoreFocus: () => assert.fail('must not queue native focus IPC') },
  };
  await restoreRendererFocus(targetWindow);
  assert.deepEqual(calls, [{ preventScroll: true }]);
  const nextInput = { isConnected: true, focus: () => assert.fail('late focus callback') };
  targetWindow.document.activeElement = nextInput;
  await Promise.resolve();
  assert.equal(targetWindow.document.activeElement, nextInput);
  assert.equal(calls.length, 1);
});

test("background documents, disconnected inputs and empty targets are left alone", async () => {
  const input = { isConnected: true, focus: () => assert.fail('background/disconnected input') };
  const document = { activeElement: input, hasFocus: () => false };
  await restoreRendererFocus({ document });
  document.hasFocus = () => true;
  input.isConnected = false;
  await restoreRendererFocus({ document });
  await restoreRendererFocus({});
  document.activeElement = document.body = { isConnected: true,
    focus: () => assert.fail('must not choose an arbitrary replacement') };
  await restoreRendererFocus({ document });
});

test("all formerly native business confirmations use scoped application dialogs", async () => {
  for (const path of viewPaths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /window\.confirm|confirmWithRendererFocus/);
    assert.match(source, /useConfirmationDialog/);
    assert.match(source, /<ConfirmationDialog/);
  }
});
