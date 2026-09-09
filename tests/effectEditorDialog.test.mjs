import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/components/GameEffectDialog.vue", import.meta.url), "utf8");

test("effect dialog exposes all configuration controls and local preview", () => {
  assert.match(source, /game-effect-dialog/);
  for (const field of ["startX", "startY", "endX", "endY", "width", "height", "step"]) {
    assert.match(source, new RegExp(`draft\\.${field}`));
  }
  assert.match(source, /value="insert"/);
  assert.match(source, /value="merge"/);
  assert.match(source, /draft\.useSprite/);
  assert.match(source, /availableSprites/);
  assert.match(source, /setColor/);
  assert.match(source, /game-effect-color-options/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /:checked="draft\.color === option\.value"/);
  assert.match(source, /setColor\(option\.value, \$event\)/);
  assert.doesNotMatch(source, /<select :value="draft\.color"/);
  assert.match(source, /resetSpriteSelection\(true\)/);
  assert.match(source, /setInterval\(\(\) =>/);
  assert.match(source, /300/);
  assert.match(source, /clearInterval/);
  assert.match(source, /@mousedown\.self/);
});

test("effect dialog confirms generated frames without backend or hardware calls", () => {
  assert.match(source, /emit\("confirm",/);
  assert.match(source, /expandEffectFrames/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /ledGame\./);
  assert.match(source, /onBeforeUnmount/);
});

test("effect preview keeps every playfield tile square", () => {
  assert.match(source, /const cellSize = Math\.max\(6, Math\.min\(24, Math\.floor\(Math\.min\(520 \/ width, 520 \/ height\)\)\)\)/);
  assert.match(source, /gridTemplateColumns: `repeat\(\$\{width\}, \$\{cellSize\}px\)`/);
  assert.match(source, /gridTemplateRows: `repeat\(\$\{height\}, \$\{cellSize\}px\)`/);
  assert.match(source, /\.game-effect-preview-stage \{[\s\S]*overflow: auto;/);
  assert.doesNotMatch(source, /\.game-effect-preview-grid \{[\s\S]*aspect-ratio: 1;/);
});
