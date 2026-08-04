import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { insertFrameAfter } from "../src/lib/simpleFrameSequence.js";

const editorSource = await readFile(
  new URL("../src/views/SimpleGameEditorView.vue", import.meta.url),
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
  const confirmation = functionSource("confirmDestructiveAction", "applyCurrentRepeatTimesToAllFrames");
  assert.match(confirmation, /const confirmed = window\.confirm\(message\)/);
  assert.match(confirmation, /restoreEditorFocus\(\)/);
  const focus = functionSource("restoreEditorFocus", "getFrameIndexFromPointer");
  assert.match(focus, /window\.focus\?\.\(\)/);
  assert.match(focus, /activeElement\.blur\(\)/);
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
