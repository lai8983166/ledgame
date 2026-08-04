import assert from "node:assert/strict";
import test from "node:test";

import { deleteLevelAt } from "../src/lib/simpleLevelSequence.js";

test("deleting a level removes only the active level and selects its neighbour", () => {
  const first = { label: "Level 1" };
  const second = { label: "Level 2" };
  const third = { label: "Level 3" };

  const middleResult = deleteLevelAt([first, second, third], 1);
  assert.equal(middleResult.deleted, true);
  assert.deepEqual(middleResult.levels, [first, third]);
  assert.equal(middleResult.activeIndex, 1);

  const lastResult = deleteLevelAt([first, second, third], 2);
  assert.deepEqual(lastResult.levels, [first, second]);
  assert.equal(lastResult.activeIndex, 1);
});

test("deleting the only level or an invalid index is rejected", () => {
  const onlyLevel = { label: "Only" };
  const levels = [onlyLevel];

  const onlyResult = deleteLevelAt(levels, 0);
  assert.equal(onlyResult.deleted, false);
  assert.equal(onlyResult.levels, levels);

  const invalidResult = deleteLevelAt([onlyLevel, { label: "Other" }], 9);
  assert.equal(invalidResult.deleted, false);
  assert.equal(invalidResult.levels.length, 2);
});
