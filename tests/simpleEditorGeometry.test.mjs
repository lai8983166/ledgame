import assert from 'node:assert/strict';
import test from 'node:test';
import { centerObjectAnchor, getAbsoluteObjectCells } from '../src/lib/simpleObjectMerge.js';
import { canApplyColorOccupancy, filterUnoccupiedColorCells } from '../src/lib/simpleOccupancy.js';

const point = (id, x, y, color = 2) => ({ id, x, y, color, points: [[0, 0]] });
test('one layer of each color; duplicates within and across objects are not applied', () => {
  const colors = [0, 1, 2, 3].map(color => point(String(color), 0, 0, color));
  assert.equal(canApplyColorOccupancy([], colors), true);
  assert.equal(canApplyColorOccupancy(colors, [...colors, point('again', 0, 0, 2)]), false);
  assert.equal(canApplyColorOccupancy([], [{ ...point('a', 0, 0), points: [[0, 0], [0, 0]] }]), false);
  assert.equal(canApplyColorOccupancy([point('same', 0, 0)], [point('same', 1, 0)]), true);
});
test('brush silently skips same-color cells only, including repeated range points', () => {
  const matrix = [point('red', 0, 0), point('blue', 1, 0, 1)];
  const before = structuredClone(matrix);
  assert.deepEqual(filterUnoccupiedColorCells(matrix, [{x:0,y:0},{x:1,y:0},{x:1,y:0},{x:2,y:0}], 2), [{x:1,y:0},{x:2,y:0}]);
  assert.deepEqual(filterUnoccupiedColorCells(matrix, [{x:0,y:0}], 2), []);
  assert.deepEqual(matrix, before);
});
test('legacy overlaps can remain or decrease, but cannot move or increase', () => {
  const legacy = ['a', 'b', 'c'].map(id => point(id, 0, 0));
  assert.equal(canApplyColorOccupancy(legacy, structuredClone(legacy)), true);
  assert.equal(canApplyColorOccupancy(legacy, legacy.slice(1)), true);
  assert.equal(canApplyColorOccupancy(legacy, [...legacy, point('d', 0, 0)]), false);
  assert.equal(canApplyColorOccupancy(legacy, legacy.map(o => ({...o,x:1}))), false);
  assert.equal(canApplyColorOccupancy([], legacy), false);
});
test('centers odd/even bounds with floor, preserving geometry and metadata without filling holes', () => {
  for (const [x,y,points,center] of [
    [0,0,[[0,0],[2,2]],[1,1]], [0,0,[[0,0],[1,1]],[0,0]],
    [-3,-5,[[0,0],[1,1]],[-3,-5]], [-8,2,[[0,0],[24,40]],[4,22]],
  ]) {
    const object = {id:'sprite',x,y,color:3,points,extra:{value:7}};
    const before = structuredClone(object), centered = centerObjectAnchor(object);
    assert.deepEqual([centered.x,centered.y], center);
    assert.deepEqual(getAbsoluteObjectCells(centered), getAbsoluteObjectCells(object));
    assert.equal(centered.id,object.id); assert.equal(centered.color,3); assert.deepEqual(centered.extra,object.extra);
    assert.deepEqual(object,before); assert.deepEqual(centerObjectAnchor(centered),centered);
    assert.equal(centered.points.length, points.length);
  }
  assert.deepEqual(centerObjectAnchor({id:'empty',x:8,y:5,points:[]}).points,[]);
});
