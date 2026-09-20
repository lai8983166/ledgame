import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { insertFrameAfter } from "../src/lib/simpleFrameSequence.js";

const editorSource = await readFile(
  new URL("../src/views/SimpleGameEditorView.vue", import.meta.url),
  "utf8",
);
const preloadSource = await readFile(
  new URL("../electron/preload.cjs", import.meta.url),
  "utf8",
);
const mainSource = await readFile(
  new URL("../electron/main.cjs", import.meta.url),
  "utf8",
);
const rendererFocusSource = await readFile(
  new URL("../src/lib/rendererFocus.js", import.meta.url),
  "utf8",
);

function functionSource(name, nextName) {
  const start = editorSource.indexOf(`function ${name}`);
  const end = nextName ? editorSource.indexOf(`function ${nextName}`, start + 1) : editorSource.length;
  assert.ok(start >= 0, `missing function ${name}`);
  return editorSource.slice(start, end);
}

test("inserting after a middle frame preserves order and selects the new blank frame", () => {
  const first = { repeatTimes: 2, matrix: [{ id: "a" }] };
  const second = { repeatTimes: 3, matrix: [{ id: "b" }] };
  const third = { repeatTimes: 4, matrix: [{ id: "c" }] };
  const blank = { repeatTimes: 1, matrix: [] };
  const frames = [first, second, third];

  const result = insertFrameAfter(frames, 1, blank);

  assert.equal(result.inserted, true);
  assert.equal(result.index, 2);
  assert.deepEqual(frames, [first, second, blank, third]);
  assert.equal(frames[result.index].repeatTimes, 1);
  assert.deepEqual(frames[result.index].matrix, []);
  assert.equal(frames[3], third);
});

test("inserting after the last frame appends and supports an empty sequence", () => {
  const last = { repeatTimes: 6, matrix: [{ id: "last" }] };
  const appended = { repeatTimes: 1, matrix: [] };
  const frames = [last];

  const result = insertFrameAfter(frames, 0, appended);

  assert.equal(result.index, 1);
  assert.deepEqual(frames, [last, appended]);

  const emptyFrames = [];
  const emptyResult = insertFrameAfter(emptyFrames, 0, { repeatTimes: 1, matrix: [] });
  assert.equal(emptyResult.index, 0);
  assert.equal(emptyFrames.length, 1);
  assert.deepEqual(emptyFrames[0], { repeatTimes: 1, matrix: [] });
});

test("editor inserts a blank frame through the existing selection and cache paths", () => {
  const insertion = functionSource("addFrameAfterCurrent", "deleteCurrentFrame");
  assert.match(insertion, /insertFrameAfter\(level\.frameList, activeFrameIndex\.value, createBlankFrame\(\)\)/);
  assert.match(insertion, /invalidateMatrixFrame\(level\.frameList\[result\.index\]\)/);
  assert.match(insertion, /clearRgbEditHistory\(\)/);
  assert.match(insertion, /selectFrame\(result\.index\)/);
});

test("copying a frame remounts repeat input and selects a newly created next frame", () => {
  const copy = functionSource("executeWholeFrameCopy", "replaceFrameObjects");
  assert.match(copy, /if \(plan\.createIndex !== null\)/);
  assert.match(copy, /level\.frameList\.splice\(plan\.createIndex, 0, createBlankFrame\(\)\)/);
  assert.match(copy, /if \(mode === "next"\) \{[\s\S]*selectFrame\(plan\.targetIndices\[0\]\)/);
  assert.match(editorSource, /:key="`repeat-\$\{activeLevelIndex\}-\$\{activeFrameIndex\}`"/);
});

test("destructive confirmation restores renderer focus after Electron dialogs", () => {
  assert.match(editorSource, /import \{ confirmWithRendererFocus, restoreRendererFocus \}/);
  assert.match(rendererFocusSource, /targetWindow\.confirm\(message\)/);
  assert.match(rendererFocusSource, /targetWindow\?\.ledGame\?\.restoreFocus\?\.\(\)/);
  assert.match(rendererFocusSource, /targetWindow\?\.focus\?\.\(\)/);
  assert.match(rendererFocusSource, /activeElement\.blur\(\)/);
  assert.match(preloadSource, /restoreFocus: \(\) => ipcRenderer\.invoke\('window:restore-focus'\)/);
  assert.match(mainSource, /ipcMain\.handle\('window:restore-focus', \(event\) =>/);
  assert.match(mainSource, /restoreBrowserWindowFocus\(targetWindow\)/);

  for (const [name, nextName] of [
    ["deleteCurrentLevel", "addFrame"],
    ["deleteCurrentFrame", "applyCurrentRepeatTimesToAllFrames"],
    ["deleteSelectedObject", "moveSelectedObjectLayerUp"],
  ]) {
    assert.match(
      functionSource(name, nextName),
      /nextTick\(restoreRendererFocus\)/,
      `${name} must restore renderer focus after Vue updates`,
    );
  }
});

test("color controls are disabled outside add mode and import/export icons follow data flow", () => {
  assert.match(
    editorSource,
    /const colorSelectionDisabled = computed\([\s\S]*interactionMode\.value !== "add"[\s\S]*selectionMode\.value[\s\S]*anchorEditMode\.value/s,
  );
  assert.match(editorSource, /:disabled="colorSelectionDisabled"/);
  const colorSelection = functionSource("selectColor", "setInteractionMode");
  assert.match(colorSelection, /if \(colorSelectionDisabled\.value\)/);

  const exportButton = editorSource.slice(
    editorSource.indexOf(":data-tip=\"t\('simple.exportCurrentFrameJson'\)\""),
    editorSource.indexOf(":data-tip=\"t\('simple.importReplaceFrameJson'\)\"")
  );
  const importButton = editorSource.slice(
    editorSource.indexOf(":data-tip=\"t\('simple.importReplaceFrameJson'\)\""),
    editorSource.indexOf("</div>", editorSource.indexOf(":data-tip=\"t\('simple.importReplaceFrameJson'\)\"")),
  );
  assert.match(exportButton, /@click="exportCurrentFrame"[\s\S]*⬆/);
  assert.match(importButton, /@click="importFrame"[\s\S]*⬇/);
});

test("anchor editing leaves only confirm and cancel controls in the object editor", () => {
  const objectActionsStart = editorSource.indexOf('<div class="object-actions">');
  const objectListStart = editorSource.indexOf('<div v-if="!anchorEditMode && showObjectList"', objectActionsStart);
  assert.ok(objectActionsStart >= 0);
  assert.ok(objectListStart > objectActionsStart);
  const objectActions = editorSource.slice(objectActionsStart, objectListStart);

  assert.match(editorSource, /<button\s+v-if="!anchorEditMode"[\s\S]*class="soft-button compact-button object-list-toggle"/);
  assert.match(editorSource, /<div v-if="!anchorEditMode" class="object-edit-controls">/);
  assert.match(objectActions, /<div v-if="!anchorEditMode" class="object-action-palette"/);
  assert.match(objectActions, /<template v-if="anchorEditMode">[\s\S]*simple\.confirm[\s\S]*simple\.cancel/);
  assert.match(objectActions, /<template v-if="!anchorEditMode">[\s\S]*simple\.greenToAll[\s\S]*simple\.pinkToAll/);
  assert.match(editorSource, /<div v-else class="anchor-edit-panel">[\s\S]*simple\.chooseAnchor/);
});
