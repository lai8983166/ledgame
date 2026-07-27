import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panelSource = await readFile(
  new URL("../src/components/elc408/Elc408DebugToolsPanel.vue", import.meta.url),
  "utf8",
);
const viewSource = await readFile(
  new URL("../src/views/Elc408DebugAssistantView.vue", import.meta.url),
  "utf8",
);

test("debug assistant keeps the existing three-panel control surface", () => {
  assert.match(viewSource, /id: "configuration"/);
  assert.match(viewSource, /id: "wiringTools"/);
  assert.match(viewSource, /id: "debugTools"/);
  assert.equal((viewSource.match(/\{ id: "/g) || []).length, 3);
  assert.match(viewSource, /<Elc408ConfigurationPanel/);
  assert.match(viewSource, /<Elc408WiringPanel/);
  assert.match(viewSource, /<Elc408DebugToolsPanel/);
});

test("DebugTools keeps all existing request controls and buttons", () => {
  for (const key of [
    "networkInterface",
    "controllerModel",
    "rgbMode",
    "controllers",
    "controllerCount",
    "maxPointsPerChannel",
    "displayColor",
    "pointCoordinate",
    "frameIntervalMs",
  ]) {
    assert.match(panelSource, new RegExp(`elc408\\.debug\\.${key}`));
  }
  for (const action of ["search", "testPoint", "start", "stop", "clearLogs"]) {
    assert.match(panelSource, new RegExp(`elc408\\.debug\\.${action}`));
  }
});

test("protocol polling does not emit DevTools diagnostics", () => {
  const pollBlock = panelSource.slice(
    panelSource.indexOf("async function pollLogs"),
    panelSource.indexOf("async function clearLogs"),
  );
  assert.doesNotMatch(pollBlock, /diagnostics\.|console\./);
  assert.doesNotMatch(panelSource, /diagnostics\.(started|succeeded|failed)\("RGB/);
});

test("backend state is applied without rewriting the local draft", () => {
  const applyBlock = panelSource.slice(
    panelSource.indexOf("function applyAuthoritativeState"),
    panelSource.indexOf("async function pollLogs"),
  );
  assert.match(applyBlock, /state\.value = nextState/);
  assert.match(applyBlock, /normalizeControllerList\(nextState\)/);
  assert.doesNotMatch(applyBlock, /draft\./);
});

test("Search, Start and Stop always recover their busy state", () => {
  for (const [startMarker, endMarker, busyRef] of [
    ["async function search()", "async function start()", "searchBusy"],
    ["async function start()", "async function stop()", "startBusy"],
    ["async function stop()", "async function testPoint()", "stopBusy"],
    ["async function testPoint()", "function applyBackendCode", "pointBusy"],
  ]) {
    const actionBlock = panelSource.slice(
      panelSource.indexOf(startMarker),
      panelSource.indexOf(endMarker),
    );
    assert.match(actionBlock, /finally\s*\{/);
    assert.match(actionBlock, new RegExp(`${busyRef}\\.value = false`));
  }
});

test("point test submits controlled fields and is disabled during continuous debug", () => {
  const pointBlock = panelSource.slice(
    panelSource.indexOf("async function testPoint()"),
    panelSource.indexOf("function applyBackendCode"),
  );
  for (const field of [
    "rgbMode",
    "networkInterfaceId",
    "controllerModel",
    "controllerCount",
    "displayColor",
    "x",
    "y",
  ]) {
    assert.match(pointBlock, new RegExp(`${field}:`));
  }
  assert.match(panelSource, /pointBusy \|\| isRunning \|\| !draft\.networkInterfaceId/);
  assert.match(panelSource, /v-model\.number="draft\.pointX"/);
  assert.match(panelSource, /v-model\.number="draft\.pointY"/);
});

test("Electron exposes only the controlled point-test endpoint", async () => {
  const [mainSource, preloadSource] = await Promise.all([
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(mainSource, /ipcMain\.handle\('elc408:debug-test-point'/);
  assert.match(mainSource, /'\/hardware\/elc408\/debug\/test-point'/);
  assert.match(mainSource, /normalizePointTestRequest\(request\)/);
  assert.match(preloadSource, /testPoint:\s*\(request\)\s*=>\s*ipcRenderer\.invoke\('elc408:debug-test-point', request\)/);
});
