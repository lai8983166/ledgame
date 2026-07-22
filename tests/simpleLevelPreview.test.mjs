import { test } from "node:test";
import assert from "node:assert/strict";

import {
  advanceLevelPreviewState,
  createLevelPreviewSnapshot,
  createLevelPreviewState,
  normalizePreviewRepeatTimes,
  rasterizeLevelPreviewFrame,
  SIMPLE_TICK_MS,
} from "../src/lib/simpleLevelPreview.js";

test("preview uses the shared 25ms Simple tick", () => {
  assert.equal(SIMPLE_TICK_MS, 25);
});

test("empty levels do not create playback state", () => {
  assert.equal(createLevelPreviewState([]), null);
  assert.equal(advanceLevelPreviewState(null, []), null);
});

test("single-frame preview advances repeats and loops", () => {
  const frames = [{ repeatTimes: 3 }];
  let state = createLevelPreviewState(frames);
  assert.deepEqual(state, { frameIndex: 0, repeatIndex: 0 });
  state = advanceLevelPreviewState(state, frames);
  assert.deepEqual(state, { frameIndex: 0, repeatIndex: 1 });
  state = advanceLevelPreviewState(state, frames);
  assert.deepEqual(state, { frameIndex: 0, repeatIndex: 2 });
  state = advanceLevelPreviewState(state, frames);
  assert.deepEqual(state, { frameIndex: 0, repeatIndex: 0 });
});

test("multi-frame preview preserves each repeat count and wraps", () => {
  const frames = [{ repeatTimes: 2 }, { repeatTimes: 1 }];
  let state = createLevelPreviewState(frames);
  state = advanceLevelPreviewState(state, frames);
  assert.deepEqual(state, { frameIndex: 0, repeatIndex: 1 });
  state = advanceLevelPreviewState(state, frames);
  assert.deepEqual(state, { frameIndex: 1, repeatIndex: 0 });
  state = advanceLevelPreviewState(state, frames);
  assert.deepEqual(state, { frameIndex: 0, repeatIndex: 0 });
});

test("invalid repeat counts normalize to one", () => {
  for (const value of [undefined, null, "bad", 0, -4]) {
    assert.equal(normalizePreviewRepeatTimes(value), 1);
  }
  assert.equal(normalizePreviewRepeatTimes("4.9"), 4);
});

test("preview snapshot is detached from unsaved editor objects", () => {
  const level = {
    label: "Level A",
    frameList: [{
      repeatTimes: 2,
      matrix: [{ id: "pink", x: 1, y: 2, color: 2, points: [[0, 0], [1, 0]] }],
    }],
  };
  const snapshot = createLevelPreviewSnapshot(level, {
    width: 16,
    height: 8,
    colors: ["#00ff00", "#0000ff", "#ff00ff", "#ffffff"],
  });
  level.frameList[0].matrix[0].points[0][0] = 99;
  level.frameList.push({ repeatTimes: 1, matrix: [] });

  assert.equal(snapshot.frames.length, 1);
  assert.deepEqual(snapshot.frames[0].matrix[0].points[0], [0, 0]);
  assert.equal(snapshot.width, 16);
  assert.equal(snapshot.height, 8);
});

test("preview rasterization forwards dimensions and palette as one options object", () => {
  const snapshot = {
    width: 2,
    height: 1,
    colors: ["#112233", "#445566", "#778899", "#aabbcc"],
  };
  const pixels = rasterizeLevelPreviewFrame({
    matrix: [{ x: 1, y: 0, color: 2, points: [[0, 0]] }],
  }, snapshot);

  assert.ok(pixels instanceof Uint8ClampedArray);
  assert.deepEqual([...pixels], [
    0, 0, 0, 255,
    0x77, 0x88, 0x99, 255,
  ]);
});
