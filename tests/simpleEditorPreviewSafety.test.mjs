import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editorSource = await readFile(
  new URL("../src/views/SimpleGameEditorView.vue", import.meta.url),
  "utf8",
);
const previewSource = await readFile(
  new URL("../src/components/SimpleLevelPreviewDialog.vue", import.meta.url),
  "utf8",
);
const styleSource = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

test("Open Preview snapshots the active level without runtime or Debug Panel IPC", () => {
  const openPreview = editorSource.slice(
    editorSource.indexOf("function openPreview()"),
    editorSource.indexOf("function closeLevelPreview()"),
  );
  assert.match(openPreview, /createLevelPreviewSnapshot\(activeLevel\.value/);
  assert.doesNotMatch(openPreview, /openDebugPanel|startGame|saveEditor|api\./);
  assert.match(editorSource, /:disabled="Boolean\(busyAction\) \|\| !activeLevel"/);
});

test("level preview is a read-only Canvas with bounded timer lifecycle", () => {
  assert.match(previewSource, /rasterizeLevelPreviewFrame\(frame, props\.snapshot\)/);
  assert.match(previewSource, /window\.setInterval[\s\S]*SIMPLE_TICK_MS/);
  assert.match(previewSource, /onBeforeUnmount[\s\S]*stopPlayback/);
  assert.match(previewSource, /pointer-events:\s*none/);
  assert.doesNotMatch(previewSource, /game\/input|cell-click|pointerdown|mousedown/);
  assert.match(previewSource, /role="dialog"/);
  assert.match(previewSource, /aria-modal="true"/);
});

test("whole-frame overwrite confirms before any frame mutation", () => {
  const executeCopy = editorSource.slice(
    editorSource.indexOf("function executeWholeFrameCopy(mode)"),
    editorSource.indexOf("function replaceFrameObjects"),
  );
  const confirmIndex = executeCopy.indexOf("confirmDestructiveAction(message)");
  assert.ok(confirmIndex > 0);
  assert.ok(confirmIndex < executeCopy.indexOf("level.frameList.splice"));
  assert.ok(confirmIndex < executeCopy.indexOf("replaceFrameObjects"));
  assert.match(executeCopy, /plan\.overwriteIndices\.length/);
  assert.match(executeCopy, /plan\.createIndex !== null/);

  const replaceFrame = editorSource.slice(
    editorSource.indexOf("function replaceFrameObjects"),
    editorSource.indexOf("function startAnchorEdit"),
  );
  assert.doesNotMatch(replaceFrame, /repeatTimes/);
});

test("object copy operations remain outside destructive confirmation", () => {
  const objectCopy = editorSource.slice(
    editorSource.indexOf("function copySelectedObjectToPreviousFrame"),
    editorSource.indexOf("function copyCurrentFrameToPreviousFrame"),
  );
  assert.doesNotMatch(objectCopy, /confirmDestructiveAction/);
});

test("Simple editor uses fit scaling without outer scrollbars or excess bottom padding", () => {
  assert.match(
    styleSource,
    /\.simple-editor-fit-viewport\s*\{[^}]*overflow:\s*hidden/s,
  );
  assert.match(
    styleSource,
    /\.simple-editor-fit-shell\s*\{[^}]*padding:\s*12px 12px 4px/s,
  );
  assert.match(
    styleSource,
    /\.simple-editor-fit-content\.simple-editor-workspace\s*\{[^}]*padding-bottom:\s*0/s,
  );
  assert.match(editorSource, /availableContentWidth \/ baseWidth/);
  assert.match(editorSource, /availableContentHeight \/ baseHeight/);
  assert.match(editorSource, /content\.scrollWidth - content\.clientWidth/);
  assert.match(editorSource, /MIN_EDITOR_FIT_WIDTH \+ horizontalOverflow/);
  assert.doesNotMatch(
    editorSource.slice(
      editorSource.indexOf("function measureEditorFit()"),
      editorSource.indexOf("function applyInitialEditorFit()"),
    ),
    /const naturalWidth = Math\.max\(\s*content\.scrollWidth/,
  );
});
