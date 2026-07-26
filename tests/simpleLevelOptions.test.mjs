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
    },
  );
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
});
