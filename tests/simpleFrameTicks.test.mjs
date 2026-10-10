import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleFrameIndices } from '../src/lib/simpleFrameSequence.js';

test('frame ticks are bounded, sorted and preserve first, last and current frames', () => {
  for (const count of [1, 12, 100, 10000]) {
    for (const current of [0, Math.floor(count / 2), count - 1]) {
      const ticks = visibleFrameIndices(count, current);
      assert.ok(ticks.length <= 13);
      assert.equal(ticks[0], 0);
      assert.equal(ticks.at(-1), count - 1);
      assert.ok(ticks.includes(current));
      assert.deepEqual(ticks, [...new Set(ticks)].sort((a, b) => a - b));
      assert.ok(ticks.every(index => index >= 0 && index < count));
    }
  }
  assert.deepEqual(visibleFrameIndices(0, 0), []);
  assert.deepEqual(visibleFrameIndices(3, 1), [0, 1, 2]);
  assert.ok(visibleFrameIndices(100, 45).includes(45));
});
