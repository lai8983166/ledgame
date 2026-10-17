import assert from "node:assert/strict";
import test from "node:test";

import { deleteLevelAt, moveLevelAt } from "../src/lib/simpleLevelSequence.js";

test('dragging reorders whole levels and keeps the active level even when crossed', () => {
  const levels = ['A','B','C'].map(label => ({label,option:{rewardPoints:10,bgVoice:label+'.mp3'},frameList:[{matrix:[label]}]}));
  const before = structuredClone(levels);
  const result = moveLevelAt(levels, 0, 2, 1);
  assert.deepEqual(result.levels.map(level => level.label), ['B','C','A']);
  assert.equal(result.activeIndex,0);
  assert.equal(result.levels[2],levels[0]);
  assert.deepEqual(levels,before);
  assert.equal(moveLevelAt(result.levels, 2, 0, 2).activeIndex,0);
  for (const [from,to] of [[-1,0],[0,10],[0,0],[null,1]]) assert.equal(moveLevelAt(levels,from,to,1).moved,false);
});

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
