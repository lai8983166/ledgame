import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("simple editor exposes the shared pixel-light layout entry and save patch", async () => {
  const source = await readFile(new URL("../src/views/SimpleGameEditorView.vue", import.meta.url), "utf8");
  assert.match(source, /PixelLightLayoutDialog/);
  assert.match(source, /openPixelLightLayout/);
  assert.match(source, /pixelLightLayoutOpen/);
  assert.match(source, /commonConfig:\s*\{\s*pixelLightWiring/);
  assert.match(source, /:grid-width="matrixWidth"/);
  assert.match(source, /:grid-height="matrixHeight"/);
});

test("layout dialog keeps drawing local and exposes the required controls", async () => {
  const source = await readFile(new URL("../src/components/PixelLightLayoutDialog.vue", import.meta.url), "utf8");
  assert.match(source, /function drawPreview\(\)/);
  assert.match(source, /function handleSave\(\)/);
  assert.match(source, /validatePixelLightWiring/);
  assert.match(source, /updatePixelLightWallCount/);
  assert.doesNotMatch(source, /previewNoHardware/);
  assert.match(source, /pixelLight\.forceAlign/);
  assert.match(source, /pixelLight\.alignPlaceholder/);
  assert.match(source, /rowErrorMessage/);
  assert.match(source, /alignOutOfRange/);
  assert.doesNotMatch(source, /window\.ledGame|fetch\(/);
});
