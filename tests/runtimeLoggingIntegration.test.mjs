import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
const assistantSource = await readFile(
  new URL("../src/views/Elc408DebugAssistantView.vue", import.meta.url),
  "utf8",
);
const debugPanelSource = await readFile(
  new URL("../src/components/elc408/Elc408DebugToolsPanel.vue", import.meta.url),
  "utf8",
);

test("backend readiness uses a successful API endpoint instead of the static root", () => {
  const waitForBackend = mainSource.slice(
    mainSource.indexOf("async function waitForBackend"),
    mainSource.indexOf("async function startEmbeddedBackend"),
  );
  assert.match(waitForBackend, /\/engine\/demo\/state/);
  assert.match(waitForBackend, /response\.ok/);
  assert.doesNotMatch(waitForBackend, /fetch\(baseUrl\)/);
});

test("layout snapshots require an explicit diagnostic environment flag", () => {
  assert.match(mainSource, /LED_LAYOUT_DIAGNOSTICS\s*===\s*'true'/);
  assert.match(mainSource, /if \(layoutDiagnosticsEnabled\)/);
  assert.match(preloadSource, /LED_LAYOUT_DIAGNOSTICS\s*===\s*'true'/);
});

test("protocol capture IPC exposes a fixed endpoint and no arbitrary URL or log path", () => {
  assert.match(mainSource, /ipcMain\.handle\('elc408:debug-log-capture'/);
  assert.match(mainSource, /normalizeLogCaptureRequest\(enabled\)/);
  assert.match(mainSource, /'\/hardware\/elc408\/debug\/logging'/);
  assert.match(preloadSource, /setLogCapture:\s*\(enabled\)\s*=>\s*ipcRenderer\.invoke\('elc408:debug-log-capture', enabled\)/);
  assert.doesNotMatch(preloadSource, /backendRequest|backendBaseUrl|backend\.log/);
});

test("window and application shutdown release protocol capture before backend stop", () => {
  assert.ok((mainSource.match(/void releaseElc408LogCapture\(\)/g) || []).length >= 2);
  const beforeQuit = mainSource.slice(mainSource.indexOf("app.on('before-quit'"));
  assert.match(beforeQuit, /event\.preventDefault\(\)/);
  assert.ok(beforeQuit.indexOf("releaseElc408LogCapture()") < beforeQuit.indexOf("stopEmbeddedBackend()"));
});

test("DebugTools owns capture only while its panel and document are visible", () => {
  assert.match(assistantSource, /:active="activePanel === 'debugTools'"/);
  assert.match(debugPanelSource, /watch\(\(\) => props\.active/);
  assert.match(debugPanelSource, /document\.visibilityState === "visible"/);
  assert.match(debugPanelSource, /await setLogCapture\(true\)/);
  assert.match(debugPanelSource, /await setLogCapture\(false\)/);
  assert.match(debugPanelSource, /setInterval\(pollLogs, 250\)/);
  assert.match(debugPanelSource, /logsCapacity = 2048/);
  assert.match(debugPanelSource, /token !== captureToken/);
  assert.match(debugPanelSource, /lastPollToken \+= 1/);
});
