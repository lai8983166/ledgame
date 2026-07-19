import assert from "node:assert/strict";
import test from "node:test";
import {
  canSelectObjectForMerge,
  MERGE_ERROR,
  mergeSameColorObjects,
} from "../src/lib/simpleObjectMerge.js";
import { selectSimpleTopItem } from "../src/lib/simpleLevelGif.js";
import { resolveLiveOccupancyCell } from "../src/lib/simpleOccupancy.js";

test("panorama selection reads objects added to the live occupancy index", () => {
  const index = new Map();
  const selectTop = (occupants) => selectSimpleTopItem(
    occupants,
    (entry) => entry.object.color,
  );

  assert.equal(resolveLiveOccupancyCell(index, "-3:5", selectTop), undefined);
  const entry = { object: { id: "outside", color: 1 }, x: -3, y: 5 };
  index.set("-3:5", [entry]);

  const resolved = resolveLiveOccupancyCell(index, "-3:5", selectTop);
  assert.equal(resolved.object.id, "outside");
  assert.equal(resolved.occupants, index.get("-3:5"));
});

test("merges single-cell and multi-cell objects without losing geometry", () => {
  const matrix = [
    { id: "a", x: 4, y: 3, color: 1, points: [[0, 0], [1, 0], [1, 1]] },
    { id: "b", x: 2, y: 6, color: 1, points: [[0, 0]] },
  ];
  const result = mergeSameColorObjects(matrix, ["a", "b"], () => "merged");

  assert.equal(result.ok, true);
  assert.deepEqual(result.object, {
    id: "merged",
    x: 4,
    y: 3,
    color: 1,
    points: [[0, 0], [1, 0], [1, 1], [-2, 3]],
  });
  assert.deepEqual(result.matrix, [result.object]);
});

test("merges several multi-cell objects and deduplicates overlapping cells", () => {
  const matrix = [
    { id: "a", x: 0, y: 0, color: 3, points: [[0, 0], [1, 0]] },
    { id: "b", x: 1, y: 0, color: 3, points: [[0, 0], [0, 1]] },
    { id: "c", x: 2, y: 1, color: 3, points: [[0, 0], [1, 0]] },
  ];
  const result = mergeSameColorObjects(matrix, ["a", "b", "c"], "merged");

  assert.equal(result.ok, true);
  assert.deepEqual(result.object.points, [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]]);
});

test("preserves panorama coordinates outside the real matrix", () => {
  const matrix = [
    { id: "left", x: -3, y: 2, color: 0, points: [[0, 0], [-1, 0]] },
    { id: "right", x: 18, y: 20, color: 0, points: [[0, 0], [0, 2]] },
  ];
  const result = mergeSameColorObjects(matrix, ["left", "right"], "merged");

  assert.deepEqual(result.object.points, [[0, 0], [-1, 0], [21, 18], [21, 20]]);
});

test("rejects mixed colors and missing objects without mutating the frame", () => {
  const matrix = [
    { id: "green", x: 0, y: 0, color: 0, points: [[0, 0]] },
    { id: "blue", x: 1, y: 0, color: 1, points: [[0, 0]] },
  ];
  const snapshot = structuredClone(matrix);

  assert.deepEqual(mergeSameColorObjects(matrix, ["green", "blue"], "merged"), {
    ok: false,
    code: MERGE_ERROR.MIXED_COLOR,
  });
  assert.deepEqual(mergeSameColorObjects(matrix, ["green", "gone"], "merged"), {
    ok: false,
    code: MERGE_ERROR.MISSING_OBJECT,
  });
  assert.deepEqual(mergeSameColorObjects(matrix, ["green"], "merged"), {
    ok: false,
    code: MERGE_ERROR.NOT_ENOUGH,
  });
  assert.deepEqual(matrix, snapshot);
});

test("merge selection locks to the first selected normalized color", () => {
  const matrix = [
    { id: "first", color: "1" },
    { id: "same", color: 1.9 },
    { id: "other", color: 3 },
  ];

  assert.equal(canSelectObjectForMerge(matrix, ["first"], "same").ok, true);
  assert.deepEqual(canSelectObjectForMerge(matrix, ["first"], "other"), {
    ok: false,
    code: MERGE_ERROR.MIXED_COLOR,
  });
});

test("merge output is stable and appended after untouched objects", () => {
  const matrix = [
    { id: "a", x: 1, y: 1, color: 1, points: [[1, 1], [0, 0]] },
    { id: "untouched", x: 9, y: 9, color: 2, points: [[0, 0]] },
    { id: "b", x: 0, y: 0, color: 1, points: [[2, 2], [1, 0]] },
  ];
  const first = mergeSameColorObjects(matrix, ["a", "b"], "merged");
  const second = mergeSameColorObjects(matrix, ["a", "b"], "merged");

  assert.deepEqual(first, second);
  assert.equal(first.matrix[0].id, "untouched");
  assert.equal(first.matrix.at(-1).id, "merged");
});

test("merged objects round-trip through the editor payload and keep green top priority", () => {
  const result = mergeSameColorObjects([
    { id: "green-a", x: 2, y: 2, color: 0, points: [[0, 0], [1, 0]] },
    { id: "green-b", x: 3, y: 2, color: 0, points: [[0, 0], [0, 1]] },
  ], ["green-a", "green-b"], "merged-green");
  const saved = JSON.parse(JSON.stringify({ matrix: result.matrix }));

  assert.deepEqual(saved.matrix[0], result.object);
  const top = selectSimpleTopItem([
    { object: { id: "red", color: 2 } },
    { object: saved.matrix[0] },
    { object: { id: "blue", color: 1 } },
  ], (entry) => entry.object.color);
  assert.equal(top.object.id, "merged-green");
});
