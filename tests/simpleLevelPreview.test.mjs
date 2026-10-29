import { test } from "node:test";
import assert from "node:assert/strict";

import {
  advanceLevelPreviewState,
  createLevelPreviewSnapshot,
  createLevelPreviewState,
  drawLevelPreviewFrame,
  normalizePreviewRepeatTimes,
  rasterizeLevelPreviewFrame,
  SIMPLE_TICK_MS,
} from "../src/lib/simpleLevelPreview.js";
import { prepareSimpleLevelGif } from "../src/lib/simpleLevelGif.js";

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

function pixelContext() {
  const context = {
    canvas: { width: 0, height: 0 },
    pixels: new Map(),
    fillRect(x, y, width, height) {
      const rgb = this.fillStyle === "#ffffff" ? [255, 255, 255] : this.fillStyle.match(/\d+/g).map(Number);
      for (let yy = y; yy < y + height; yy += 1) {
        for (let xx = x; xx < x + width; xx += 1) this.pixels.set(`${xx},${yy}`, rgb);
      }
    },
  };
  return context;
}

test("display grid separates same-color cells, preserves centers and covers first/last edges", () => {
  for (const [width, height] of [[1, 1], [3, 2], [2, 3]]) {
    const context = pixelContext();
    const snapshot = { width, height, colors: ["#123456"] };
    const frame = { matrix: [{ x: 0, y: 0, color: 0, points: Array.from({ length: width * height }, (_, i) => [i % width, Math.floor(i / width)]) }] };
    drawLevelPreviewFrame(context, frame, snapshot, 8);
    assert.equal(context.canvas.width, width * 8);
    assert.equal(context.canvas.height, height * 8);
    for (let y = 0; y < height * 8; y += 1) {
      for (let x = 0; x < width * 8; x += 1) {
        const edge = x % 8 === 0 || y % 8 === 0 || x === width * 8 - 1 || y === height * 8 - 1;
        assert.deepEqual(context.pixels.get(`${x},${y}`), edge ? [255, 255, 255] : [18, 52, 86], `${width}x${height} at ${x},${y}`);
      }
    }
  }
});

test("high DPI grid remains thin and preview drawing cannot change raw GIF pixels or snapshot", () => {
  const level = { frameList: [{ repeatTimes: 3, matrix: [
    { x: 0, y: 0, color: 0, points: [[0, 0], [1, 0]] },
    { x: 1, y: 1, color: 1, points: [[0, 0]] },
  ] }] };
  const document = { siteSizeWidth: 2, siteSizeHeight: 2, color0: "#112233", color1: "#445566" };
  const snapshot = createLevelPreviewSnapshot(level, { width: 2, height: 2, colors: [document.color0, document.color1] });
  const original = structuredClone(snapshot);
  const before = prepareSimpleLevelGif(level, document);
  const context = pixelContext();
  drawLevelPreviewFrame(context, snapshot.frames[0], snapshot, 20, 2);
  assert.deepEqual(context.pixels.get("20,10"), [255, 255, 255]);
  assert.deepEqual(context.pixels.get("21,10"), [255, 255, 255]);
  assert.deepEqual(context.pixels.get("22,10"), [17, 34, 51]);
  assert.deepEqual(context.pixels.get("30,30"), [68, 85, 102]);
  assert.deepEqual(context.pixels.get("10,30"), [0, 0, 0]);
  assert.deepEqual(snapshot, original);
  assert.deepEqual(prepareSimpleLevelGif(level, document), before);
  assert.equal(before.frames[0].pixels.length, 2 * 2 * 4);
  assert.deepEqual([...rasterizeLevelPreviewFrame(snapshot.frames[0], snapshot)], [...before.frames[0].pixels]);
});
