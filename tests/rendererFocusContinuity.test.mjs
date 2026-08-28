import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  confirmWithRendererFocus,
  restoreRendererFocus,
} from "../src/lib/rendererFocus.js";

const viewPaths = [
  "../src/views/DatabaseRefreshView.vue",
  "../src/views/LedGameTouchView.vue",
  "../src/views/RankGameEditorView.vue",
  "../src/views/SimpleGameEditorView.vue",
];

test("renderer confirmation restores the window immediately and after preload IPC completes", async () => {
  let resolveRestore;
  const pendingRestore = new Promise((resolve) => {
    resolveRestore = resolve;
  });
  const calls = [];
  const activeElement = { blur: () => calls.push("blur") };
  const targetWindow = {
    confirm: (message) => {
      calls.push(`confirm:${message}`);
      return false;
    },
    focus: () => calls.push("focus"),
    document: { activeElement },
    ledGame: { restoreFocus: () => pendingRestore },
  };

  assert.equal(confirmWithRendererFocus("leave?", targetWindow), false);
  assert.deepEqual(calls, ["confirm:leave?", "focus", "blur"]);
  resolveRestore();
  await pendingRestore;
  await Promise.resolve();
  assert.deepEqual(calls, ["confirm:leave?", "focus", "blur", "focus", "blur"]);
});

test("focus restoration tolerates missing and rejected preload bridges", async () => {
  const calls = [];
  const targetWindow = {
    focus: () => calls.push("focus"),
    document: { activeElement: null },
    ledGame: { restoreFocus: () => Promise.reject(new Error("unavailable")) },
  };

  await restoreRendererFocus(targetWindow);
  assert.deepEqual(calls, ["focus"]);
});

test("all renderer native confirmations use the shared focus boundary", async () => {
  for (const path of viewPaths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /window\.confirm/);
  }
  const sources = await Promise.all(viewPaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.equal(sources.filter((source) => source.includes("confirmWithRendererFocus")).length, 4);
});
