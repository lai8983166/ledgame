import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { messages } from "../src/i18n/messages.js";

const editorSource = await readFile(
  new URL("../src/views/SimpleGameEditorView.vue", import.meta.url),
  "utf8",
);
const styleSource = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = editorSource.indexOf(`function ${name}`);
  const end = nextName ? editorSource.indexOf(`function ${nextName}`, start + 1) : editorSource.length;
  assert.ok(start >= 0, `missing function ${name}`);
  return editorSource.slice(start, end);
}

test("RGB history controls expose disabled state, tooltips, and standard shortcuts", () => {
  assert.match(editorSource, /@click="undoRgbEdit"/);
  assert.match(editorSource, /@click="redoRgbEdit"/);
  assert.match(editorSource, /:disabled="Boolean\(busyAction\) \|\| !canUndoRgbEdit"/);
  assert.match(editorSource, /:disabled="Boolean\(busyAction\) \|\| !canRedoRgbEdit"/);
  assert.match(editorSource, /:data-tip="t\('simple\.undoRgbTip'\)"/);
  assert.match(editorSource, /:data-tip="t\('simple\.redoRgbTip'\)"/);

  const keydown = functionSource("handleGlobalKeydown", "toInteger");
  assert.match(keydown, /historyModifier = event\.ctrlKey \|\| event\.metaKey/);
  assert.match(keydown, /lowerKey === "y"/);
  assert.match(keydown, /lowerKey === "z" && event\.shiftKey/);
  assert.ok(
    keydown.indexOf('["input", "textarea", "select"]') < keydown.indexOf("historyShortcut"),
    "editable controls must retain their native undo before RGB shortcuts are evaluated",
  );
});

test("matrix edits use RGB transactions while frame and level structure clear history", () => {
  const rgbFunctions = [
    ["handleCellClick", "handleCellRangeCreate"],
    ["handleCellRangeCreate", "handleObjectDragStart"],
    ["handleObjectDragEnd", "queueMatrixBasePatch"],
    ["applyBrushColorToSelectedObject", "deleteSelectedObject"],
    ["deleteSelectedObject", "moveSelectedObjectLayerUp"],
    ["reorderSelectedObject", "applySelectedObjectLayerToAllFrames"],
    ["applySelectedObjectLayerToAllFrames", "copySelectedObjectToPreviousFrame"],
    ["copySelectedObjectToAllFrames", "copyColorObjectsToAllFrames"],
    ["copyColorObjectsToAllFrames", "copySelectedObjectToFrame"],
    ["copySelectedObjectToFrame", "upsertObjectInFrame"],
    ["confirmAnchorEdit", "stopAnchorEdit"],
    ["rotateSelectedObject", "moveSelectedObject"],
    ["moveSelectedObject", "togglePanoramaMode"],
    ["mergeSelectedObjects", "openContextMenu"],
  ];
  for (const [name, nextName] of rgbFunctions) {
    assert.match(functionSource(name, nextName), /runRgbEdit\(/, `${name} must record RGB history`);
  }

  const structuralFunctions = [
    ["loadEditor", "waitForEditorFonts"],
    ["importCurrentLevel", "runEditorAction"],
    ["addLevel", "startLevelDrag"],
    ["dropLevel", "deleteCurrentLevel"],
    ["deleteCurrentLevel", "addFrame"],
    ["addFrame", "deleteCurrentFrame"],
    ["deleteCurrentFrame", "applyCurrentRepeatTimesToAllFrames"],
    ["executeWholeFrameCopy", "replaceFrameObjects"],
  ];
  for (const [name, nextName] of structuralFunctions) {
    assert.match(
      functionSource(name, nextName),
      /clearRgbEditHistory\(\)/,
      `${name} must invalidate RGB history`,
    );
  }
});

test("RGB history restores only matrices and refreshes derived editor state", () => {
  const restore = functionSource("restoreRgbHistorySnapshot", "clampIndex");
  assert.match(restore, /frame\.matrix = cloneRgbMatrix\(item\.matrix\)/);
  assert.doesNotMatch(restore, /document\.value\s*=/);
  assert.doesNotMatch(restore, /repeatTimes|\\.option|siteSize/);
  assert.match(restore, /resetMatrixFrameCache\(\)/);
  assert.match(restore, /syncSelectedObject\(\)/);
  assert.match(restore, /scheduleMatrixCacheWarmup/);
  const sync = functionSource("syncSelectedObject", "canTriggerGlobalShortcut");
  assert.match(sync, /const frame = activeFrame\.value \|\| ensureActiveFrame\(\)/,
    "selection refresh must preserve arbitrary restored object anchors");
});

test("level deletion is confirmed and disabled when only one level remains", () => {
  const deletion = functionSource("deleteCurrentLevel", "addFrame");
  assert.match(deletion, /confirmWithRendererFocus\(t\("simple\.deleteLevelConfirm"/);
  assert.match(deletion, /deleteLevelAt\(document\.value\.levels, index, activeLevelIndex\.value\)/);
  assert.match(deletion, /activeFrameIndex\.value = 0/);
  assert.match(deletion, /clearRgbEditHistory\(\)/);
  assert.match(editorSource, /:disabled="Boolean\(busyAction\) \|\| !canDeleteActiveLevel \|\| anchorEditMode \|\| draggingLevelIndex !== null"/);
  assert.match(editorSource, /class="level-tab-delete"[\s\S]*@click\.stop="deleteCurrentLevel\(index\)"/);
  assert.match(
    styleSource,
    /\.level-sequence-row\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/s,
  );
  assert.match(
    styleSource,
    /\.level-structure-actions \.icon-add-button\[data-tip\]::after[\s\S]*top:\s*calc\(100% \+ 8px\);[\s\S]*bottom:\s*auto/s,
  );
});

test("level drag replaces reorder buttons and editor-only disabled styling remains visible", () => {
  assert.match(
    styleSource,
    /\.simple-editor-workspace \.icon-add-button\[data-tip\]::after/,
  );
  assert.match(
    styleSource,
    /\.simple-editor-workspace \.icon-add-button\[data-tip\]:hover::after/,
  );
  assert.doesNotMatch(editorSource, /class="level-reorder-actions"/);
  assert.match(editorSource, /@dragstart="startLevelDrag\(\$event, index\)"/);
  assert.match(editorSource, /@drop\.prevent="dropLevel\(index\)"/);
  assert.match(
    styleSource,
    /\.level-reorder-actions \.icon-add-button\[data-tip\]::after\s*\{[^}]*top:\s*calc\(100% \+ 8px\);[^}]*bottom:\s*auto/s,
  );
  assert.match(
    styleSource,
    /\.simple-editor-workspace button:disabled\s*\{[^}]*cursor:\s*not-allowed/s,
  );
  assert.match(
    styleSource,
    /\.simple-editor-workspace button:disabled\s*\{[^}]*border-color:[^}]*color:[^}]*background:/s,
  );
  assert.match(
    styleSource,
    /\.simple-editor-workspace button:disabled:hover,[\s\S]*transform:\s*none/,
  );
});

test("all supported locales provide RGB history labels", () => {
  for (const locale of Object.keys(messages)) {
    const simple = messages[locale]?.simple;
    assert.ok(simple?.undoRgb, `${locale} undoRgb`);
    assert.ok(simple?.redoRgb, `${locale} redoRgb`);
    assert.ok(simple?.undoRgbTip, `${locale} undoRgbTip`);
    assert.ok(simple?.redoRgbTip, `${locale} redoRgbTip`);
    assert.ok(simple?.rgbUndoComplete, `${locale} rgbUndoComplete`);
    assert.ok(simple?.rgbRedoComplete, `${locale} rgbRedoComplete`);
  }
});
