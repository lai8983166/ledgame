import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorSource = await readFile(
  new URL("../src/views/SimpleGameEditorView.vue", import.meta.url),
  "utf8",
);

test("object editor actions use accessible icons instead of button copy", () => {
  assert.match(editorSource, /import EditorActionIcon from "\.\.\/components\/EditorActionIcon\.vue"/);
  for (const icon of [
    "check", "close", "rotate-left", "rotate-right", "anchor", "layer-up", "layer-down",
    "layers", "palette", "copy-previous", "copy-next", "copy-all", "trash", "copy-color",
  ]) {
    assert.match(editorSource, new RegExp(`<EditorActionIcon name="${icon}"`), `${icon} icon`);
  }
  assert.doesNotMatch(editorSource, /\{\{ t\("simple\.(rotateLeft|rotateRight|recolor|copyPrevious|copyNext|copyAll|delete)"\) \}\}/);
  assert.match(editorSource, /:aria-label="t\('simple\.(rotateLeft|rotateRight|recolor|copyPrevious|copyNext|copyAll|delete)'\)"/);
  assert.match(editorSource, /class="[^"]*color-copy-red[^"]*"[\s\S]*copyColorObjectsToAllFrames\(2\)/);
  assert.match(editorSource, /redCopyTitle/);
});

test("object list is collapsed by default and can be toggled", () => {
  assert.match(editorSource, /const showObjectList = ref\(false\)/);
  assert.match(editorSource, /:aria-pressed="showObjectList"/);
  assert.match(editorSource, /@click="showObjectList = !showObjectList"/);
  assert.match(editorSource, /<div v-if="showObjectList" class="object-list">/);
  assert.match(editorSource, /simple\.showObjects/);
  assert.match(editorSource, /simple\.showSpritePreview/);
});

test("brush mode and color controls are hosted by the object editor", () => {
  const objectPanel = editorSource.match(/<div class="object-panel">([\s\S]*?)<\/div>\s*<div class="editor-side-rail">/);
  assert.ok(objectPanel, "object panel block");
  assert.match(objectPanel[1], /<EditorInteractionModeSwitch/);
  assert.match(objectPanel[1], /class="object-action-palette"/);
  assert.doesNotMatch(
    editorSource.slice(editorSource.indexOf('<div class="editor-side-rail">')),
    /<EditorInteractionModeSwitch|class="palette-options"/,
  );
});

test("sprite brush filters the library and creates a sprite object", () => {
  assert.match(editorSource, /import EditorSpritePreview from "\.\.\/components\/EditorSpritePreview\.vue"/);
  assert.match(editorSource, /const spriteBrushActive = ref\(false\)/);
  assert.match(editorSource, /const spriteDimensionFilter = computed\(\(\) =>/);
  assert.match(editorSource, /const filteredEditorSprites = computed\(\(\) =>/);
  assert.match(editorSource, /function createSpriteMatrixObject\(x, y, sprite, frame\)/);
  assert.match(editorSource, /runRgbEdit\(currentFrameRgbHistoryTargets\(\), "create-sprite-object"/);
  assert.match(editorSource, /class="[^\"]*object-sprite-button[^\"]*"/);
  assert.match(editorSource, /<EditorActionIcon name="sprite" \/>/);
  assert.match(editorSource, /<div v-else class="sprite-preview-panel">/);
  assert.match(editorSource, /v-model="spriteSearchText"/);
  assert.match(editorSource, /v-for="sprite in filteredEditorSprites"/);
  assert.match(editorSource, /@click="selectEditorSprite\(sprite\)"/);
});
