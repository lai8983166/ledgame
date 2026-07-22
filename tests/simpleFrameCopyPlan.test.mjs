import { test } from "node:test";
import assert from "node:assert/strict";

import { createWholeFrameCopyPlan } from "../src/lib/simpleFrameCopyPlan.js";

test("previous frame is an overwrite target", () => {
  assert.deepEqual(createWholeFrameCopyPlan("previous", 2, 4), {
    targetIndices: [1],
    overwriteIndices: [1],
    createIndex: null,
  });
});

test("next existing frame requires overwrite confirmation", () => {
  assert.deepEqual(createWholeFrameCopyPlan("next", 0, 2), {
    targetIndices: [1],
    overwriteIndices: [1],
    createIndex: null,
  });
});

test("next missing frame is created without overwrite confirmation", () => {
  assert.deepEqual(createWholeFrameCopyPlan("next", 0, 1), {
    targetIndices: [1],
    overwriteIndices: [],
    createIndex: 1,
  });
});

test("copy all targets every non-current frame once", () => {
  assert.deepEqual(createWholeFrameCopyPlan("all", 1, 4), {
    targetIndices: [0, 2, 3],
    overwriteIndices: [0, 2, 3],
    createIndex: null,
  });
});

test("invalid directions and unavailable previous targets are no-ops", () => {
  assert.deepEqual(createWholeFrameCopyPlan("previous", 0, 2).targetIndices, []);
  assert.deepEqual(createWholeFrameCopyPlan("all", 0, 1).targetIndices, []);
  assert.deepEqual(createWholeFrameCopyPlan("invalid", 0, 2).targetIndices, []);
});
