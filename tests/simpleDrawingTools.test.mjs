import assert from 'node:assert/strict';
import test from 'node:test';
import { drawingToolCursor } from '../src/lib/simpleDrawingTools.js';

test('tools provide distinct cursors regardless of occupied cells', () => {
  assert.equal(drawingToolCursor('select'), 'default');
  assert.equal(drawingToolCursor('select', true), 'grab');
  assert.equal(drawingToolCursor('select', true, true), 'grabbing');
  for (const tool of ['add', 'delete']) {
    assert.match(drawingToolCursor(tool), /^url\("data:image\/svg\+xml,/);
    assert.equal(drawingToolCursor(tool), drawingToolCursor(tool, true));
  }
  assert.equal(drawingToolCursor('region'), 'crosshair');
  assert.notEqual(drawingToolCursor('add'), drawingToolCursor('delete'));
});
