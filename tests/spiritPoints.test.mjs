import test from "node:test";
import assert from "node:assert/strict";
import {
  clampSpiritDimension,
  createSpiritUpdatePayload,
  createSpiritCreatePayload,
  cropSpiritPoints,
  parseSpiritPoints,
} from "../src/lib/spiritPoints.js";

test("parseSpiritPoints accepts legacy JSON and removes duplicate coordinates", () => {
  assert.deepEqual(parseSpiritPoints("[[2,1],[0,0],[2,1],[\"bad\",3]]"), [[2, 1], [0, 0]]);
});

test("cropSpiritPoints preserves only points inside resized matrix", () => {
  assert.deepEqual(cropSpiritPoints([[2, 1], [0, 0], [3, 2], [-1, 0]], 3, 2), [[0, 0], [2, 1]]);
});

test("createSpiritUpdatePayload clamps dimensions and returns structured points", () => {
  assert.equal(clampSpiritDimension(999), 96);
  assert.deepEqual(createSpiritUpdatePayload(2, 2, [[1, 1], [2, 1]]), {
    width: 2,
    height: 2,
    points: [[1, 1]],
  });
});

test("createSpiritCreatePayload trims name and reuses shape normalization", () => {
  assert.deepEqual(createSpiritCreatePayload("  New spirit  ", 2, 2, [[1, 1], [2, 1]]), {
    name: "New spirit",
    width: 2,
    height: 2,
    points: [[1, 1]],
  });
});
