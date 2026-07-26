import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { inferFrameSize } = require("../electron/frame-size.cjs");
const mainSource = await readFile(
  new URL("../electron/main.cjs", import.meta.url),
  "utf8",
);

test("runtime state resolves a rectangular RGB frame", () => {
  assert.deepEqual(
    inferFrameSize(16 * 36 * 3, { width: 16, height: 36 }),
    { width: 16, height: 36 },
  );
});

test("frame dimensions use only candidates matching the RGB payload", () => {
  assert.deepEqual(
    inferFrameSize(
      12 * 48 * 3,
      { width: 16, height: 16 },
      { width: 12, height: 48 },
    ),
    { width: 12, height: 48 },
  );
});

test("square and fixed fallbacks remain available without runtime metadata", () => {
  assert.deepEqual(inferFrameSize(8 * 8 * 3), { width: 8, height: 8 });
  assert.deepEqual(inferFrameSize(16 * 36 * 3), { width: 24, height: 24 });
  assert.deepEqual(inferFrameSize(17 * 19 * 3), { width: 16, height: 16 });
});

test("Electron applies runtime dimensions to new and already buffered frames", () => {
  assert.match(
    mainSource,
    /inferFrameSize\(rgb\.length,\s*latestEngineState,\s*latestFrame\)/,
  );
  assert.match(mainSource, /refreshLatestFrameSize\(state\)/);
  assert.match(
    mainSource,
    /inferFrameSize\(latestFrame\.rgb\.length,\s*state,\s*latestFrame\)/,
  );
});
