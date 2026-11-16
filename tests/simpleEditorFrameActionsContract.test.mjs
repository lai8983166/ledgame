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
  assert.match(insertion, /insertFrameAfter\(level\.frameList, activeFrameIndex\.value, createBlankFrame\(activeFrame\.value\)\)/);
  assert.match(insertion, /invalidateMatrixFrame\(level\.frameList\[result\.index\]\)/);
  assert.match(insertion, /clearRgbEditHistory\(\)/);
  assert.match(insertion, /selectFrame\(result\.index\)/);
});

test("copying a frame remounts repeat input and selects a newly created next frame", () => {
  const copy = functionSource("executeWholeFrameCopy", "replaceFrameObjects");
  assert.match(copy, /if \(plan\.createIndex !== null\)/);
  assert.match(copy, /level\.frameList\.splice\(plan\.createIndex, 0, createBlankFrame\(level\.frameList\[plan\.createIndex - 1\]\)\)/);
  assert.match(copy, /if \(mode === "next"\) \{[\s\S]*selectFrame\(plan\.targetIndices\[0\]\)/);
  assert.match(editorSource, /:key="`repeat-\$\{activeLevelIndex\}-\$\{activeFrameIndex\}`"/);
});

test("destructive editor actions use awaited application confirmation without restacking ordinary edits", () => {
  assert.match(editorSource, /useConfirmationDialog/);
  assert.match(editorSource, /<ConfirmationDialog/);
  assert.doesNotMatch(editorSource, /confirmWithRendererFocus|window\.confirm/);

  for (const [name, nextName] of [
    ["deleteCurrentLevel", "addFrame"],
    ["deleteCurrentFrame", "applyCurrentRepeatTimesToAllFrames"],
  ]) {
    assert.match(
      functionSource(name, nextName),
      /await confirmAction\(/,
      `${name} awaits application confirmation before modifying its original target`,
    );
  }
  for (const [name,next] of [['deleteCurrentLevel','addFrame'],['deleteCurrentFrame','applyCurrentRepeatTimesToAllFrames'],['deleteSelectedObject','moveSelectedObjectLayerUp'],['executeWholeFrameCopy','replaceFrameObjects']]) {
    assert.doesNotMatch(functionSource(name,next), /nextTick\(restoreRendererFocus\)/, `${name} must not restack the window after ordinary Vue edits`);
  }
});

test("color controls protect busy/modal editing and import/export icons follow data flow", () => {
  assert.match(
    editorSource,
    /const colorSelectionDisabled = computed\([\s\S]*busyAction\.value[\s\S]*selectionMode\.value[\s\S]*anchorEditMode\.value/s,
  );
  assert.match(editorSource, /:disabled="colorSelectionDisabled"/);
  const colorSelection = functionSource("selectColor", "selectEditorSprite");
  assert.match(colorSelection, /if \(colorSelectionDisabled\.value\)/);

  const exportButton = editorSource.slice(
    editorSource.indexOf(":data-tip=\"t\('simple.exportCurrentLevelJson'\)\""),
    editorSource.indexOf(":data-tip=\"t\('simple.importLevelJson'\)\"")
  );
  const importButton = editorSource.slice(
    editorSource.indexOf(":data-tip=\"t\('simple.importLevelJson'\)\""),
    editorSource.indexOf("</div>", editorSource.indexOf(":data-tip=\"t\('simple.importLevelJson'\)\"")),
  );
  assert.match(exportButton, /@click="exportCurrentLevel"[\s\S]*EditorActionIcon name="export"/);
  assert.match(importButton, /@click="importCurrentLevel"[\s\S]*EditorActionIcon name="import"/);
});

test("level import validates before appending without replacement, and restores focus", () => {
  const importing = functionSource("importCurrentLevel", "runEditorAction");
  assert.ok(importing.indexOf('normalizeImportedLevel(') < importing.indexOf('document.value.levels.push(imported)'));
  assert.doesNotMatch(importing, /confirmWithRendererFocus|levels\[levelIndex\] =/);
  assert.match(importing, /nextTick\(restoreRendererFocus\)/);
  assert.match(importing, /document\.value !== targetDocument/);
  assert.doesNotMatch(importing, /saveGameEditor/);
  assert.match(preloadSource, /importFrameJson: \(payload\) => ipcRenderer\.invoke\('frame:import-json', payload\)/);
  assert.match(mainSource, /title: payload\?\.title \|\| '导入帧'/);
});

test("anchor editing leaves only confirm and cancel controls in the object editor", () => {
  const objectActionsStart = editorSource.indexOf('<div class="object-actions">');
  const objectListStart = editorSource.indexOf('<div v-if="!anchorEditMode && showObjectList"', objectActionsStart);
  assert.ok(objectActionsStart >= 0);
  assert.ok(objectListStart > objectActionsStart);
  const objectActions = editorSource.slice(objectActionsStart, objectListStart);

  assert.match(editorSource, /<button\s+v-if="!anchorEditMode"[\s\S]*class="soft-button compact-button object-list-toggle"/);
  assert.doesNotMatch(editorSource, /object-edit-controls/);
  assert.match(editorSource, /<div v-if="!anchorEditMode" class="object-action-palette"/);
  assert.match(objectActions, /<template v-if="anchorEditMode">[\s\S]*simple\.confirm[\s\S]*simple\.cancel/);
  assert.match(objectActions, /<template v-if="!anchorEditMode">[\s\S]*simple\.greenToAll[\s\S]*simple\.pinkToAll/);
  assert.match(editorSource, /<div v-else class="anchor-edit-panel">[\s\S]*simple\.chooseAnchor/);
});
