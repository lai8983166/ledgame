import assert from 'node:assert/strict';
import test from 'node:test';
import { createObjectEraseStroke, drawingStrokeCells, drawingToolCursor } from '../src/lib/simpleDrawingTools.js';
import { createRgbEditHistory } from '../src/lib/simpleRgbEditHistory.js';

test('fast strokes include intermediate cells in both directions and negative panorama space', () => {
  assert.deepEqual(drawingStrokeCells({ x: -2, y: 1 }, { x: 2, y: 1 }),
    [-2, -1, 0, 1, 2].map(x => ({ x, y: 1 })));
  assert.deepEqual(drawingStrokeCells({ x: 2, y: 3 }, { x: 0, y: 1 }),
    [{ x: 2, y: 3 }, { x: 1, y: 2 }, { x: 0, y: 1 }]);
  assert.deepEqual(drawingStrokeCells({ x: 1, y: 1 }, { x: 1, y: 1 }), [{ x: 1, y: 1 }]);
  assert.deepEqual(drawingStrokeCells(null, { x: 1, y: 1 }), []);
  assert.deepEqual(drawingStrokeCells({ x: .5, y: 1 }, { x: 1, y: 1 }), []);
});

test('tools provide distinct cursors regardless of occupied cells', () => {
  assert.equal(drawingToolCursor('select'), 'default');
  assert.equal(drawingToolCursor('select', true), 'grab');
  assert.equal(drawingToolCursor('select', true, true), 'grabbing');
  for (const tool of ['brush', 'eraser']) {
    assert.match(drawingToolCursor(tool), /^url\("data:image\/svg\+xml,/);
    assert.equal(drawingToolCursor(tool), drawingToolCursor(tool, true));
  }
  assert.notEqual(drawingToolCursor('brush'), drawingToolCursor('eraser'));
});

test('eraser removes touched whole objects using the existing green/top-layer priority', () => {
  const matrix = [
    { id: 'green', x: 2, y: 2, color: 0, points: [[0, 0], [1, 0]], extra: 'keep' },
    { id: 'red', x: 2, y: 2, color: 2, points: [[0, 0], [0, 1]] },
    { id: 'far', x: 8, y: 8, color: 1, points: [[-1, 0], [0, 0], [1, 0]] },
  ];
  const before = structuredClone(matrix), stroke = createObjectEraseStroke(matrix);
  assert.equal(stroke.visit([{ x: 2, y: 2 }]), true);
  assert.deepEqual([...stroke.removedIds], ['green']);
  assert.equal(stroke.visit([{ x: 3, y: 2 }]), false, 'the entire green object has disappeared');
  assert.equal(stroke.visit([{ x: 2, y: 3 }]), true);
  assert.deepEqual([...stroke.removedIds], ['green', 'red']);
  assert.equal(stroke.visit([{ x: 0, y: 0 }]), false);
  assert.deepEqual(matrix, before, 'preview must not mutate coordinates, IDs, points, or metadata');
});

test('one completed eraser gesture is one reversible snapshot and an empty stroke is a no-op', () => {
  const matrix = [
    { id: 'even-anchor', x: 3, y: 3, color: 2, points: [[-1, 0], [0, 0]], extra: { keep: true } },
    { id: 'odd-anchor', x: 7, y: 3, color: 1, points: [[-1, -1], [0, 0], [1, 1]] },
  ];
  const history = createRgbEditHistory(), stroke = createObjectEraseStroke(matrix);
  stroke.visit(drawingStrokeCells({ x: 2, y: 3 }, { x: 7, y: 3 }));
  const after = matrix.filter(object => !stroke.removedIds.has(object.id));
  history.commit(matrix, after);
  assert.equal(history.undoCount, 1); assert.deepEqual(after, []);
  assert.deepEqual(history.undo().snapshot, matrix);
  assert.deepEqual(history.redo().snapshot, []);
  const empty = createObjectEraseStroke(matrix);
  assert.equal(empty.visit([{ x: 0, y: 0 }]), false);
  assert.equal(history.commit(matrix, matrix.filter(object => !empty.removedIds.has(object.id))), false);
});
