import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createWiringDocument,
  appendPoint,
  appendRectangle,
  deletePoint,
  deleteRectangle,
  setActiveChannel,
  resizeFrame,
  setMaxPointsPerChannel,
  setMode,
  toDownloadPayload,
  summarizeChannels,
  findPoint,
  WIRING_MODES,
} from "../src/lib/elc408/elc408Wiring.js";

test("createWiringDocument uses canonical defaults", () => {
  const doc = createWiringDocument();
  assert.equal(doc.width, 16);
  assert.equal(doc.height, 32);
  assert.equal(doc.maxPointsPerChannel, 64);
  assert.equal(doc.mode, "SINGLE_ROW_PRIORITY");
  assert.deepEqual(doc.lines, [[]]);
  assert.equal(doc.activeChannelIndex, 0);
});

test("appendPoint adds to active channel and respects occupancy", () => {
  let doc = createWiringDocument();
  const r1 = appendPoint(doc, 0, 0);
  assert.equal(r1.ok, true);
  doc = r1.document;
  const r2 = appendPoint(doc, 0, 0);
  assert.equal(r2.ok, false);
  assert.equal(r2.error, "ALREADY_OCCUPIED");
});

test("appendPoint spills to next channel when full", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 1 });
  doc = appendPoint(doc, 0, 0).document;
  doc = appendPoint(doc, 1, 0).document;
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.activeChannelIndex, 1);
  assert.deepEqual(doc.lines[1][0], [1, 0]);
});

test("appendRectangle orders by row then column in default mode", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 64 });
  doc = appendRectangle(doc, 0, 0, 1, 1).document;
  assert.deepEqual(doc.lines[0], [[0, 0], [1, 0], [0, 1], [1, 1]]);
});

test("TURN_BACK_ROW_PRIORITY alternates row direction", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 64, mode: "TURN_BACK_ROW_PRIORITY" });
  doc = appendRectangle(doc, 0, 0, 1, 1).document;
  // row 0 forward: (0,0), (1,0)
  // row 1 backward: (1,1), (0,1)
  assert.deepEqual(doc.lines[0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
});

test("TURN_BACK_COL_PRIORITY alternates column direction", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 64, mode: "TURN_BACK_COL_PRIORITY" });
  doc = appendRectangle(doc, 0, 0, 1, 1).document;
  // col 0 forward: (0,0), (0,1)
  // col 1 backward: (1,1), (1,0)
  assert.deepEqual(doc.lines[0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
});

test("appendRectangle filters occupied points before ordering", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 64 });
  doc = appendPoint(doc, 1, 0).document;
  doc = appendRectangle(doc, 0, 0, 2, 0).document;
  assert.deepEqual(doc.lines[0], [[1, 0], [0, 0], [2, 0]]);
});

test("deletePoint preserves order and renumbers via index", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 64 });
  doc = appendPoint(doc, 0, 0).document;
  doc = appendPoint(doc, 1, 0).document;
  doc = appendPoint(doc, 2, 0).document;
  doc = deletePoint(doc, 1, 0).document;
  assert.deepEqual(doc.lines[0], [[0, 0], [2, 0]]);
});

test("deleteRectangle preserves empty line placeholder", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 1 });
  doc = appendPoint(doc, 0, 0).document;
  doc = appendPoint(doc, 1, 0).document;
  doc = deleteRectangle(doc, 0, 0, 1, 0).document;
  assert.equal(doc.lines.length, 2);
  assert.deepEqual(doc.lines[0], []);
  assert.deepEqual(doc.lines[1], []);
});

test("setActiveChannel clamps index", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 1 });
  doc = appendPoint(doc, 0, 0).document;
  doc = appendPoint(doc, 1, 0).document;
  // Spilled into two channels: [0]=1pt, [1]=1pt
  doc = setActiveChannel(doc, 99);
  assert.equal(doc.activeChannelIndex, 1);
  doc = setActiveChannel(doc, 0);
  assert.equal(doc.activeChannelIndex, 0);
});

test("resizeFrame rejects out-of-bounds existing points", () => {
  let doc = createWiringDocument({ width: 16, height: 32 });
  doc = appendPoint(doc, 15, 31).document;
  const result = resizeFrame(doc, { width: 8, height: 8 });
  assert.equal(result.ok, false);
  assert.equal(result.error, "OUT_OF_BOUNDS_POINTS");
  assert.equal(result.outOfBounds.length, 1);
});

test("setMaxPointsPerChannel rejects existing over-limit lines", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 64 });
  doc = appendPoint(doc, 0, 0).document;
  doc = appendPoint(doc, 1, 0).document;
  const result = setMaxPointsPerChannel(doc, 1);
  assert.equal(result.ok, false);
  assert.equal(result.error, "EXISTING_LINE_EXCEEDS_MAX");
});

test("setMode rejects unknown modes", () => {
  const doc = createWiringDocument();
  const result = setMode(doc, "Boustrophedon");
  assert.equal(result.ok, false);
});

test("toDownloadPayload strips mode and activeChannelIndex", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 8, mode: "TURN_BACK_ROW_PRIORITY" });
  doc = appendPoint(doc, 0, 0).document;
  const payload = toDownloadPayload(doc);
  assert.deepEqual(Object.keys(payload).sort(), ["height", "lines", "maxPointsPerChannel", "width"]);
  assert.equal(payload.mode, undefined);
  assert.equal(payload.activeChannelIndex, undefined);
});

test("summarizeChannels reports point counts", () => {
  let doc = createWiringDocument({ width: 16, height: 32, maxPointsPerChannel: 1 });
  doc = appendPoint(doc, 0, 0).document;
  doc = appendPoint(doc, 1, 0).document;
  const summaries = summarizeChannels(doc);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].pointCount, 1);
  assert.equal(summaries[1].pointCount, 1);
});

test("WIRING_MODES exposes four modes", () => {
  assert.deepEqual(WIRING_MODES, [
    "SINGLE_ROW_PRIORITY",
    "SINGLE_COL_PRIORITY",
    "TURN_BACK_ROW_PRIORITY",
    "TURN_BACK_COL_PRIORITY",
  ]);
});

test("appendPoint rejects out-of-bounds coordinates", () => {
  const doc = createWiringDocument({ width: 4, height: 4 });
  const r = appendPoint(doc, 10, 10);
  assert.equal(r.ok, false);
  assert.equal(r.error, "OUT_OF_BOUNDS");
});

test("findPoint locates existing coordinates", () => {
  let doc = createWiringDocument({ width: 16, height: 32 });
  doc = appendPoint(doc, 3, 4).document;
  const found = findPoint(doc, 3, 4);
  assert.equal(found.lineIndex, 0);
  assert.equal(found.pixelIndex, 0);
});
