import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareSimpleLevelGif,
  rasterizeSimpleFrame,
  selectSimpleTopItem,
  simpleFrameDelayMs,
} from "../src/lib/simpleLevelGif.js";
import { encodePreparedSimpleGif } from "../src/lib/simpleGifEncoder.js";

function pixelAt(rgba, width, x, y) {
  const offset = (y * width + x) * 4;
  return [...rgba.slice(offset, offset + 4)];
}

test("selectSimpleTopItem uses last green object, otherwise last object", () => {
  const objects = [{ id: "green-a", color: 0 }, { id: "blue", color: 1 }, { id: "green-b", color: 0 }];
  assert.equal(selectSimpleTopItem(objects).id, "green-b");
  assert.equal(selectSimpleTopItem([{ id: "pink", color: 2 }, { id: "blue", color: 1 }]).id, "blue");
});

test("rasterizeSimpleFrame maps matrix coordinates, colors and black background", () => {
  const rgba = rasterizeSimpleFrame(
    {
      matrix: [
        { id: "blue", x: 1, y: 0, color: 1, points: [[0, 0], [0, 1]] },
        { id: "pink", x: 1, y: 0, color: 2, points: [[0, 0]] },
        { id: "green", x: 1, y: 0, color: 0, points: [[0, 0]] },
        [2, 1, "white", { color: 3, points: [[0, 0]] }],
      ],
    },
    { width: 3, height: 2, colors: ["#00ff00", "#0000ff", "#ff00ff", "#ffffff"] },
  );
  assert.deepEqual(pixelAt(rgba, 3, 0, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixelAt(rgba, 3, 1, 0), [0, 255, 0, 255]);
  assert.deepEqual(pixelAt(rgba, 3, 1, 1), [0, 0, 255, 255]);
  assert.deepEqual(pixelAt(rgba, 3, 2, 1), [255, 255, 255, 255]);
});

test("simpleFrameDelayMs rounds 25ms ticks to GIF centiseconds", () => {
  assert.equal(simpleFrameDelayMs(1), 30);
  assert.equal(simpleFrameDelayMs(2), 50);
  assert.equal(simpleFrameDelayMs(3), 80);
});

test("prepareSimpleLevelGif preserves frame order and exact configured palette", () => {
  const result = prepareSimpleLevelGif(
    {
      frameList: [
        { repeatTimes: 1, matrix: [{ x: 0, y: 0, color: 0, points: [[0, 0]] }] },
        { repeatTimes: 4, matrix: [{ x: 1, y: 0, color: 2, points: [[0, 0]] }] },
      ],
    },
    {
      siteSizeWidth: 2,
      siteSizeHeight: 1,
      color0: "#123456",
      color1: "#234567",
      color2: "#345678",
      color3: "#456789",
    },
  );
  assert.equal(result.width, 2);
  assert.equal(result.height, 1);
  assert.deepEqual(result.frames.map((frame) => frame.delay), [30, 100]);
  assert.deepEqual(pixelAt(result.frames[0].pixels, 2, 0, 0), [18, 52, 86, 255]);
  assert.deepEqual(pixelAt(result.frames[1].pixels, 2, 1, 0), [52, 86, 120, 255]);
  assert.deepEqual(result.palette.at(-1), [0, 0, 0]);
});

test("prepareSimpleLevelGif includes default colors when document colors are absent", () => {
  const result = prepareSimpleLevelGif(
    { frameList: [{ matrix: [{ x: 0, y: 0, color: 1, points: [[0, 0]] }] }] },
    { siteSizeWidth: 1, siteSizeHeight: 1 },
  );
  assert.ok(result.palette.some((color) => color.join(",") === "0,0,255"));
  assert.deepEqual(pixelAt(result.frames[0].pixels, 1, 0, 0), [0, 0, 255, 255]);
});

test("encodePreparedSimpleGif produces animated GIF with expected size and delays", () => {
  const prepared = prepareSimpleLevelGif(
    {
      frameList: [
        { repeatTimes: 1, matrix: [{ x: 0, y: 0, color: 0, points: [[0, 0]] }] },
        { repeatTimes: 4, matrix: [{ x: 1, y: 0, color: 2, points: [[0, 0]] }] },
      ],
    },
    { siteSizeWidth: 2, siteSizeHeight: 1, color0: "#00ff00", color2: "#ff00ff" },
  );
  const bytes = encodePreparedSimpleGif(prepared);
  assert.equal(Buffer.from(bytes.slice(0, 6)).toString("ascii"), "GIF89a");
  assert.equal(bytes[6] | (bytes[7] << 8), 2);
  assert.equal(bytes[8] | (bytes[9] << 8), 1);
  const delays = [];
  for (let index = 0; index < bytes.length - 7; index += 1) {
    if (bytes[index] === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 0x04) {
      delays.push((bytes[index + 4] | (bytes[index + 5] << 8)) * 10);
    }
  }
  assert.deepEqual(delays, [30, 100]);
  assert.equal(bytes.at(-1), 0x3b);
});
