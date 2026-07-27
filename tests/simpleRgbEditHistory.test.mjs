import assert from "node:assert/strict";
import test from "node:test";

import { createRgbEditHistory } from "../src/lib/simpleRgbEditHistory.js";

function snapshot(x, id = "object") {
  return {
    activeLevelIndex: 0,
    activeFrameIndex: 0,
    selectedObjectId: id,
    matrices: [{
      levelIndex: 0,
      frameIndex: 0,
      matrix: [{ id, x, y: 0, color: 1, points: [[0, 0]] }],
    }],
  };
}

test("undo and redo return the matching RGB snapshots", () => {
  const history = createRgbEditHistory();
  assert.equal(history.commit(snapshot(1), snapshot(2), { action: "move" }), true);

  assert.equal(history.canUndo, true);
  assert.equal(history.undo().snapshot.matrices[0].matrix[0].x, 1);
  assert.equal(history.canRedo, true);
  assert.equal(history.redo().snapshot.matrices[0].matrix[0].x, 2);
});

test("identical snapshots do not create a history entry", () => {
  const history = createRgbEditHistory();

  assert.equal(history.commit(snapshot(1), snapshot(1)), false);
  assert.equal(history.undoCount, 0);
  assert.equal(history.canUndo, false);
});

test("a new RGB edit clears the redo branch", () => {
  const history = createRgbEditHistory();
  history.commit(snapshot(1), snapshot(2));
  history.undo();
  assert.equal(history.canRedo, true);

  history.commit(snapshot(1), snapshot(3));

  assert.equal(history.canRedo, false);
  assert.equal(history.undoCount, 1);
});

test("history respects the configured capacity", () => {
  const history = createRgbEditHistory({ limit: 2 });
  history.commit(snapshot(0), snapshot(1));
  history.commit(snapshot(1), snapshot(2));
  history.commit(snapshot(2), snapshot(3));

  assert.equal(history.undoCount, 2);
  assert.equal(history.undo().snapshot.matrices[0].matrix[0].x, 2);
  assert.equal(history.undo().snapshot.matrices[0].matrix[0].x, 1);
  assert.equal(history.undo(), null);
});

test("committed and returned snapshots are isolated from callers", () => {
  const history = createRgbEditHistory();
  const before = snapshot(1);
  const after = snapshot(2);
  history.commit(before, after);

  before.matrices[0].matrix[0].x = 99;
  after.matrices[0].matrix[0].x = 88;
  const undone = history.undo();
  undone.snapshot.matrices[0].matrix[0].x = 77;

  assert.equal(history.redo().snapshot.matrices[0].matrix[0].x, 2);
  assert.equal(history.undo().snapshot.matrices[0].matrix[0].x, 1);
});

test("clear removes both undo and redo entries", () => {
  const history = createRgbEditHistory();
  history.commit(snapshot(1), snapshot(2));
  history.undo();

  history.clear();

  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});
