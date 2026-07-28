import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { drawTwoPhaseCanvasPatch } from "../src/lib/simpleCanvasPatch.js";
import {
  createLatestAsyncTaskGuard,
  createLatestAsyncValueLoader,
} from "../src/lib/latestAsyncTask.js";
import {
  runGuardedFrameSequence,
  waitForGuardedPromise,
} from "../src/lib/guardedAsyncFlow.js";
import { clearLogsWithPollingIsolation } from "../src/lib/elc408/logPollingControl.js";

const matrixCanvasSource = await readFile(
  new URL("../src/components/SimpleMatrixCanvas.vue", import.meta.url),
  "utf8",
);
const editorSource = await readFile(
  new URL("../src/views/SimpleGameEditorView.vue", import.meta.url),
  "utf8",
);
const mediaPickerSource = await readFile(
  new URL("../src/components/MediaPickerDialog.vue", import.meta.url),
  "utf8",
);
const mediaLibrarySource = await readFile(
  new URL("../src/views/MediaLibraryView.vue", import.meta.url),
  "utf8",
);
const debugToolsSource = await readFile(
  new URL("../src/components/elc408/Elc408DebugToolsPanel.vue", import.meta.url),
  "utf8",
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("Canvas patch clears every dirty region before redrawing occupied and empty cells", () => {
  const calls = [];
  const context = {
    clearRect(...args) {
      calls.push({ type: "clear", args });
    },
  };
  const cells = [
    { key: "occupied", classes: { "object-cell": true } },
    { key: "empty", classes: { "object-cell": false } },
  ];

  const count = drawTwoPhaseCanvasPatch(context, cells, {
    cellSize: 20,
    resolvePatchCell(cell) {
      return cell.key === "occupied"
        ? { cell, left: 20, top: 40 }
        : { cell, left: 40, top: 40 };
    },
    drawPatchCell(_context, cell) {
      calls.push({ type: "draw", key: cell.key });
    },
  });

  assert.equal(count, 2);
  assert.deepEqual(calls.map((call) => call.type), ["clear", "clear", "draw", "draw"]);
  assert.deepEqual(calls[0].args, [16, 36, 28, 28]);
  assert.deepEqual(calls.slice(2).map((call) => call.key), ["occupied", "empty"]);
});

test("SimpleMatrixCanvas uses the two-phase patch renderer and keeps full redraw fallback", () => {
  assert.match(matrixCanvasSource, /import \{ drawTwoPhaseCanvasPatch \}/);
  assert.match(matrixCanvasSource, /drawTwoPhaseCanvasPatch\(context, patchCells/);
  assert.match(matrixCanvasSource, /lastGeometrySignature !== createGeometrySignature\(\)[\s\S]*drawBaseCanvas\(\)/);
});

test("invalidating an async task prevents its delayed continuation from committing", async () => {
  const guard = createLatestAsyncTaskGuard();
  const ticket = guard.begin("editor-1");
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  let committed = false;

  const continuation = pending.then(() => {
    if (guard.isCurrent(ticket, "editor-1")) {
      committed = true;
    }
  });
  guard.invalidate();
  release();
  await continuation;

  assert.equal(committed, false);
});

test("Simple editor invalidates load generations and refuses fit scheduling after unmount", () => {
  assert.match(editorSource, /const editorLoadGuard = createLatestAsyncTaskGuard\(\)/);
  assert.match(editorSource, /onBeforeUnmount\(\(\) => \{[\s\S]*editorLoadGuard\.invalidate\(\)/);
  assert.match(editorSource, /const loadTicket = editorLoadGuard\.begin\(gameId\)/);
  assert.match(editorSource, /await api\.getGameEditor\(gameId\);[\s\S]*!isCurrentEditorLoad\(loadTicket\)/);
  assert.match(editorSource, /waitForGuardedPromise\(\{/);
  assert.match(editorSource, /runGuardedFrameSequence\(\{/);

  const scheduleBlock = editorSource.slice(
    editorSource.indexOf("function scheduleEditorFitMeasurement()"),
    editorSource.indexOf("function measureEditorFit()"),
  );
  const measureBlock = editorSource.slice(
    editorSource.indexOf("function measureEditorFit()"),
    editorSource.indexOf("function applyInitialEditorFit()"),
  );
  assert.match(scheduleBlock, /if \(!editorMounted \|\| fitMeasureFrame\)/);
  assert.match(measureBlock, /if \(!editorMounted\) \{\s*return;/);
});

test("guarded font readiness stops after lifecycle invalidation", async () => {
  const pending = deferred();
  let current = true;
  const waiting = waitForGuardedPromise({
    promise: pending.promise,
    isCurrent: () => current,
    ignoreError: true,
  });

  current = false;
  pending.resolve();

  assert.equal(await waiting, false);
});

test("guarded frame stabilization does not measure or reveal after unmount", async () => {
  const pendingFrame = deferred();
  let current = true;
  let measureCount = 0;
  let revealCount = 0;
  const stabilization = runGuardedFrameSequence({
    frames: 3,
    nextFrame: () => pendingFrame.promise,
    isCurrent: () => current,
    measure: () => {
      measureCount += 1;
    },
    reveal: () => {
      revealCount += 1;
    },
  });

  current = false;
  pendingFrame.resolve();

  assert.equal(await stabilization, false);
  assert.equal(measureCount, 0);
  assert.equal(revealCount, 0);
});

test("only the latest media preview request can commit when promises resolve out of order", async () => {
  const first = deferred();
  const second = deferred();
  let selectedPath = "media/a.png";
  let preview = null;
  const loader = createLatestAsyncValueLoader({
    loadValue: (path) => path === "media/a.png" ? first.promise : second.promise,
    isActive: () => true,
    getCurrentKey: () => selectedPath,
    onSuccess: (result) => {
      preview = result;
    },
    onError: (error) => {
      preview = { error: error.message };
    },
  });

  const firstLoad = loader.load(selectedPath);
  selectedPath = "media/b.png";
  const secondLoad = loader.load(selectedPath);
  second.resolve({ path: "media/b.png" });
  await secondLoad;
  first.resolve({ path: "media/a.png" });
  await firstLoad;

  assert.deepEqual(preview, { path: "media/b.png" });
});

test("invalidating media preview requests ignores stale errors from refresh or close", async () => {
  const pending = deferred();
  let active = true;
  let selectedPath = "media/a.mp3";
  let previewError = "";
  const loader = createLatestAsyncValueLoader({
    loadValue: () => pending.promise,
    isActive: () => active,
    getCurrentKey: () => selectedPath,
    onSuccess() {},
    onError(error) {
      previewError = error.message;
    },
  });

  const request = loader.load(selectedPath);
  active = false;
  selectedPath = "";
  loader.invalidate();
  pending.reject(new Error("stale decoder error"));
  await request;

  assert.equal(previewError, "");
});

test("media picker and library guard preview writes with request token and current path", () => {
  assert.match(mediaPickerSource, /createLatestAsyncValueLoader\(\{/);
  assert.match(mediaPickerSource, /getCurrentKey: \(\) => selected\.value/);
  assert.match(mediaPickerSource, /onBeforeUnmount\(\(\) => \{[\s\S]*previewLoader\.invalidate\(\)/);

  assert.match(mediaLibrarySource, /createLatestAsyncValueLoader\(\{/);
  assert.match(mediaLibrarySource, /getCurrentKey: \(\) => selectedPath\.value/);
  assert.match(mediaLibrarySource, /async function selectNode\(node\) \{[\s\S]*preview\.value = null/);
  assert.match(mediaLibrarySource, /async function loadMedia\(\) \{[\s\S]*previewLoader\.invalidate\(\)/);
  assert.match(mediaLibrarySource, /onBeforeUnmount\(\(\) => \{[\s\S]*previewLoader\.invalidate\(\)/);
});

test("a poll started before Clear log cannot restore old logs or cursor", async () => {
  const pollGuard = createLatestAsyncTaskGuard();
  const stalePollTicket = pollGuard.begin("poll");
  let cursor = 8;
  let logs = [{ seq: 8 }];
  const order = [];

  function applyPoll(ticket, result) {
    if (!pollGuard.isCurrent(ticket, "poll")) {
      return;
    }
    logs = result.items;
    cursor = result.nextCursor;
  }

  const result = await clearLogsWithPollingIsolation({
    stopPolling() {
      order.push("stop");
      pollGuard.invalidate();
    },
    async clearRemote() {
      order.push("clear");
      return { data: 20 };
    },
    applyClearedState(nextCursor) {
      order.push("apply");
      logs = [];
      cursor = nextCursor;
    },
    handleError() {
      assert.fail("clear should not fail");
    },
    resumePolling() {
      order.push("resume");
    },
  });

  applyPoll(stalePollTicket, {
    items: [{ seq: 9 }],
    nextCursor: 9,
  });

  assert.equal(result.cleared, true);
  assert.deepEqual(order, ["stop", "clear", "apply", "resume"]);
  assert.deepEqual(logs, []);
  assert.equal(cursor, 20);
});

test("failed Clear log reports the error and still resumes polling", async () => {
  const failure = new Error("backend unavailable");
  const order = [];

  const result = await clearLogsWithPollingIsolation({
    stopPolling: () => order.push("stop"),
    clearRemote: async () => {
      order.push("clear");
      throw failure;
    },
    applyClearedState: () => assert.fail("failed clear must not reset local logs"),
    handleError: (error) => {
      order.push("error");
      assert.equal(error, failure);
    },
    resumePolling: () => order.push("resume"),
  });

  assert.equal(result.cleared, false);
  assert.deepEqual(order, ["stop", "clear", "error", "resume"]);
  assert.match(debugToolsSource, /clearLogsWithPollingIsolation\(\{/);
  assert.match(debugToolsSource, /captureStatus\.value === "active" && shouldCaptureLogs\(\)/);
});
