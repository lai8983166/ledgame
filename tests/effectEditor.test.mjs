import test from "node:test";
import assert from "node:assert/strict";
import {
  EFFECT_SPRITE_NAMES,
  applyEffectToFrameList,
  expandEffectFrames,
  filterEffectSprites,
  normalizeEffectConfig,
  sampleEffectTrajectory,
  validateEffectConfig,
} from "../src/lib/effectEditor.js";

const spirits = [
  { id: "safe", name: "安全块", color: 0, width: 1, height: 1, points: "[[0,0]]", basic: true },
  { id: "score", name: "得分块", color: 1, width: 1, height: 1, points: "[[0,0]]", basic: true },
  { id: "trap", name: "陷阱块", color: 2, width: 1, height: 1, points: "[[0,0]]", basic: true },
  { id: "trap-duplicate", name: "陷阱块", color: 2, width: 1, height: 1, points: "[[0,0]]", basic: false },
  { id: "double", name: "Double", color: 3, width: 2, height: 1, points: "[[0,0],[1,0]]", basic: true },
];

test("effect sprite whitelist is color-aware and de-duplicates by name", () => {
  assert.equal(EFFECT_SPRITE_NAMES[2].length, 17);
  assert.deepEqual(filterEffectSprites(spirits, 0).map((item) => item.name), ["安全块"]);
  assert.deepEqual(filterEffectSprites(spirits, 1).map((item) => item.name), ["得分块"]);
  assert.deepEqual(filterEffectSprites(spirits, 2).map((item) => item.id), ["trap"]);
  assert.deepEqual(filterEffectSprites(spirits, 3).map((item) => item.name), ["Double"]);
});

test("effect config validation returns stable fields for bad input", () => {
  const errors = validateEffectConfig({
    startX: 0,
    startY: 1,
    endX: 17,
    endY: 1,
    width: 0,
    height: 1,
    step: 0,
  }, { gridWidth: 16, gridHeight: 16, spirits });
  assert.deepEqual(errors.map((error) => error.field), ["startX", "endX", "step", "width"]);

  const outOfBounds = validateEffectConfig({
    startX: 16,
    startY: 16,
    endX: 16,
    endY: 16,
    width: 2,
    height: 2,
    step: 1,
  }, { gridWidth: 16, gridHeight: 16, spirits });
  assert.equal(outOfBounds[0].code, "FOOTPRINT_OUT_OF_RANGE");

  const badSprite = validateEffectConfig({ color: 3, useSprite: true, spriteId: "missing" }, {
    gridWidth: 16,
    gridHeight: 16,
    spirits,
  });
  assert.equal(badSprite[0].field, "spriteId");
});

test("trajectory includes both endpoints and stays bounded for sub-unit steps", () => {
  assert.deepEqual(sampleEffectTrajectory({ startX: 1, startY: 1, endX: 1, endY: 1, step: 0.1 }), [{ x: 0, y: 0 }]);
  const positions = sampleEffectTrajectory({ startX: 1, startY: 1, endX: 5, endY: 1, step: 2 });
  assert.deepEqual(positions, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }]);
  const bounded = sampleEffectTrajectory({ startX: 1, startY: 1, endX: 16, endY: 16, step: 0.01 }, { maxFrames: 8 });
  assert.ok(bounded.length <= 8);
  assert.deepEqual(bounded.at(-1), { x: 15, y: 15 });
  const repeated = sampleEffectTrajectory({ startX: 1, startY: 1, endX: 2, endY: 1, step: 0.1 });
  assert.ok(repeated.length > 2);
  assert.ok(repeated.some((position, index) => index > 0 && position.x === repeated[index - 1].x));
});

test("rectangle expansion creates stable objects and sprite expansion reuses one UID", () => {
  const rectangles = expandEffectFrames({
    startX: 1,
    startY: 1,
    endX: 3,
    endY: 1,
    width: 2,
    height: 1,
    step: 1,
    color: 0,
  }, { spirits, idPrefix: "rect" });
  assert.equal(rectangles.length, 3);
  assert.deepEqual(rectangles[0].matrix.map((object) => [object.x, object.y]), [[0, 0], [1, 0]]);
  assert.deepEqual(rectangles[2].matrix.map((object) => [object.x, object.y]), [[2, 0], [3, 0]]);
  assert.deepEqual(rectangles[0].matrix.map((object) => object.id), rectangles[2].matrix.map((object) => object.id));

  const spritesExpanded = expandEffectFrames({
    color: 3,
    startX: 2,
    startY: 2,
    endX: 3,
    endY: 2,
    width: 1,
    height: 1,
    step: 1,
    useSprite: true,
    spriteId: "double",
  }, { spirits, idPrefix: "sprite" });
  assert.equal(spritesExpanded[0].matrix.length, 1);
  assert.deepEqual(spritesExpanded[0].matrix[0].points, [[0, 0], [1, 0]]);
  assert.equal(spritesExpanded[0].matrix[0].id, spritesExpanded[1].matrix[0].id);
});

test("insert preserves current frame after effect and merge appends without deleting objects", () => {
  const source = [
    { repeatTimes: 1, matrix: [{ id: "before", x: 0, y: 0, color: 0, points: [[0, 0]] }] },
    { repeatTimes: 1, matrix: [{ id: "current", x: 1, y: 1, color: 1, points: [[0, 0]] }] },
  ];
  const generated = [{ repeatTimes: 1, matrix: [{ id: "effect-0", x: 2, y: 2, color: 2, points: [[0, 0]] }] }];
  const sourceSnapshot = JSON.parse(JSON.stringify(source));
  const inserted = applyEffectToFrameList(source, 1, generated, "insert");
  assert.equal(inserted.frameList.length, 3);
  assert.equal(inserted.frameList[2].matrix[0].id, "current");

  const merged = applyEffectToFrameList(source, 1, [generated[0], { repeatTimes: 1, matrix: [{ id: "effect-0", x: 3, y: 3, color: 2, points: [[0, 0]] }] }], "merge");
  assert.equal(merged.frameList.length, 3);
  assert.deepEqual(merged.frameList[1].matrix.map((object) => object.id), ["current", "effect-0"]);
  assert.equal(merged.frameList[2].matrix[0].id, "effect-0");
  assert.deepEqual(source, sourceSnapshot);
});

test("normalization preserves explicit merge mode and sprite flag", () => {
  assert.deepEqual(normalizeEffectConfig({ isMerge: true, useSprite: 1 }).mode, "merge");
  assert.equal(normalizeEffectConfig({ useSprite: 0 }).useSprite, false);
});
