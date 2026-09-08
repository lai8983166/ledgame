import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import focusModule from "../electron/window-focus.cjs";

const { restoreBrowserWindowFocus, showNativeDialogWithFocusRestore } = focusModule;

function createWindowFixture() {
  const calls = [];
  const targetWindow = {
    isDestroyed: () => false,
    isMinimized: () => false,
    isVisible: () => true,
    setFocusable: (value) => calls.push(["setFocusable", value]),
    moveTop: () => calls.push(["moveTop"]),
    focus: () => calls.push(["focus"]),
    webContents: { focus: () => calls.push(["webContents.focus"]) },
  };
  return { calls, targetWindow };
}

test("BrowserWindow focus restoration runs now and schedules Windows message-loop retries", () => {
  const fixture = createWindowFixture();
  const immediate = [];
  const delayed = [];

  assert.equal(restoreBrowserWindowFocus(fixture.targetWindow, {
    setImmediateFn: (callback) => immediate.push(callback),
    setTimeoutFn: (callback, delay) => delayed.push([callback, delay]),
  }), true);

  assert.equal(fixture.calls.filter(([name]) => name === "focus").length, 1);
  assert.equal(immediate.length, 1);
  assert.equal(delayed[0][1], 50);
  immediate[0]();
  delayed[0][0]();
  assert.equal(fixture.calls.filter(([name]) => name === "focus").length, 3);
  assert.equal(fixture.calls.filter(([name]) => name === "webContents.focus").length, 3);
});

test("native dialogs are owned by the sender window and restore focus on success", async () => {
  const fixture = createWindowFixture();
  const options = { title: "save" };
  const dialogCalls = [];
  const result = await showNativeDialogWithFocusRestore({
    BrowserWindow: { fromWebContents: () => fixture.targetWindow },
    dialog: { showSaveDialog: async (...args) => { dialogCalls.push(args); return { canceled: true }; } },
    event: { sender: {} },
    method: "showSaveDialog",
    options,
    focusOptions: { setImmediateFn: () => {}, setTimeoutFn: () => {} },
  });

  assert.deepEqual(result, { canceled: true });
  assert.deepEqual(dialogCalls[0], [fixture.targetWindow, options]);
  assert.equal(fixture.calls.some(([name]) => name === "focus"), true);
});

test("native dialogs restore focus when the Electron dialog rejects", async () => {
  const fixture = createWindowFixture();
  await assert.rejects(showNativeDialogWithFocusRestore({
    BrowserWindow: { fromWebContents: () => fixture.targetWindow },
    dialog: { showOpenDialog: async () => { throw new Error("dialog failed"); } },
    event: { sender: {} },
    method: "showOpenDialog",
    options: {},
    focusOptions: { setImmediateFn: () => {}, setTimeoutFn: () => {} },
  }), /dialog failed/);
  assert.equal(fixture.calls.some(([name]) => name === "focus"), true);
});

test("main process routes every file dialog through the focus-restoring boundary", async () => {
  const main = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.doesNotMatch(main, /await dialog\.show(?:Save|Open)Dialog/);
  assert.equal((main.match(/showNativeDialogWithFocusRestore\(\{/g) || []).length, 5);
});
