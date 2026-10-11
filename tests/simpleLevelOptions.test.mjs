import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLevelOption,
  validateLevelOption,
} from "../src/lib/simpleLevelOptions.js";

test("normalizes legacy level limits into canonical modes", () => {
  assert.deepEqual(
    normalizeLevelOption({ timeLimit: true, timeLimitValue: "8", lifeLimit: true, lifeLimitValue: "3" }),
    {
      timeLimit: true,
      timeLimitValue: 8,
      timeLimitMode: "CYCLE_SECONDS",
      lifeLimit: true,
      lifeLimitValue: 3,
      lifeLimitMode: "LIMITED",
      rewardPoints: 0,
    },
  );
});

test('challenge ignores dormant level life validation without ignoring other limits', () => {
  const option = {lifeLimitMode:'LIMITED',lifeLimitValue:0,timeLimitMode:'CYCLE_COUNT',timeLimitValue:0};
  assert.deepEqual(validateLevelOption(option,true).map(error=>error.field),['timeLimitValue']);
  assert.deepEqual(validateLevelOption(option,false).map(error=>error.field),['timeLimitValue','lifeLimitValue']);
});

test("unlimited modes clear stale values and bounded modes require positive integers", () => {
  assert.equal(normalizeLevelOption({
    timeLimitMode: "UNLIMITED",
    timeLimitValue: 9,
    lifeLimitMode: "UNLIMITED",
    lifeLimitValue: 4,
  }).timeLimitValue, 0);
  assert.equal(validateLevelOption({
    timeLimitMode: "CYCLE_COUNT",
    timeLimitValue: 0,
    lifeLimitMode: "LIMITED",
    lifeLimitValue: -1,
  }).length, 2);
  assert.equal(normalizeLevelOption({ rewardPoints: "25" }).rewardPoints, 25);
  assert.equal(validateLevelOption({ rewardPoints: -1 }).some((error) => error.field === "rewardPoints"), true);
  assert.equal(validateLevelOption({ rewardPoints: 1.5 }).some((error) => error.field === "rewardPoints"), true);
  assert.equal(validateLevelOption({ rewardPoints: 1_000_001 }).some((error) => error.field === "rewardPoints"), true);
  assert.equal(validateLevelOption({ rewardPoints: 1_000_000 }).length, 0);
});
