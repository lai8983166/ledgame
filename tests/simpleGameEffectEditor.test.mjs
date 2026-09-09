import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/views/SimpleGameEditorView.vue", import.meta.url), "utf8");

test("simple editor opens the shared effect dialog for all default variants", () => {
  assert.match(source, /import GameEffectDialog/);
  assert.match(source, /effectDialogOpen/);
  assert.match(source, /openEffectDialog/);
  assert.match(source, /<GameEffectDialog/);
  assert.match(source, /:grid-width="matrixWidth"/);
  assert.match(source, /:grid-height="matrixHeight"/);
  assert.match(source, /:level-index="activeLevelIndex"/);
  assert.match(source, /:frame-index="activeFrameIndex"/);
  assert.match(source, /@confirm="applyEffectResult"/);
});

test("effect confirmation only mutates the level frameList draft", () => {
  assert.match(source, /applyEffectToFrameList/);
  assert.match(source, /level\.frameList = applied\.frameList/);
  assert.match(source, /resetMatrixFrameCache\(\)/);
  assert.match(source, /clearRgbEditHistory\(\)/);
  assert.match(source, /effectDialogOpen\.value = false/);
  assert.doesNotMatch(source, /effect-editor/);
});

test("effect frames use the existing game save payload and leave global wiring in place", () => {
  assert.match(source, /function createEditorPayload\(\)/);
  assert.match(source, /api\.saveGameEditor\(currentGameId\.value, payload\)/);
  assert.match(source, /pixelLightWiring/);
  assert.match(source, /saveSimpleGlobalConfigDocument/);
});

test("effect button sits beside existing global and pixel-light configuration", () => {
  assert.match(source, /t\("simple\.globalConfig"\)/);
  assert.match(source, /t\("pixelLight\.open"\)/);
  assert.match(source, /t\("effect\.open"\)/);
});
