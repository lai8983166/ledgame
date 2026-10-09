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
  const start = source.indexOf('<div v-if="document" class="editor-toolbar">');
  const end = source.indexOf('<div class="editor-feedback"', start);
  assert.ok(start >= 0 && end > start);
  const toolbar = source.slice(start, end);
  for (const [key, icon, handler] of [
    ["simple.globalConfig", "settings", "openGlobalConfig"],
    ["pixelLight.open", "pixel-light", "openPixelLightLayout"],
    ["effect.open", "effect", "openEffectDialog"],
  ]) {
    const button = toolbar.match(new RegExp('<button[^>]*:aria-label="t\\([\x27\"]' + key.replaceAll('.', '\\.') + '[\x27\"]\\)"[^>]*>[\\s\\S]*?</button>'))?.[0];
    assert.ok(button, `${key} must be an accessible toolbar button`);
    assert.ok(button.includes(`@click="${handler}"`));
    assert.ok(button.includes(`<EditorActionIcon name="${icon}" />`));
  }
});
