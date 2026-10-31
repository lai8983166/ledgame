import test from 'node:test';
import assert from 'node:assert/strict';
import { gameFieldDimensionsValid, invalidGameFieldDimensionPaths, gameFieldDimensionForDisplay } from '../src/lib/gameFieldDimensions.js';
import { prepareSimpleLevelGif } from '../src/lib/simpleLevelGif.js';
import { saveSimpleGlobalConfigDocument } from '../src/lib/simpleGlobalConfig.js';

test('field dimensions use integer 1–50 consistently; old document values remain unchanged', async () => {
  for (const value of [1, 16, 36, 50]) assert.equal(gameFieldDimensionsValid({ siteSizeWidth: value, siteSizeHeight: value }), true);
  for (const value of [0, -1, 1.5, 50.5, 51, 128, '', '16', null]) {
    const document = { siteSizeWidth: value, siteSizeHeight: 36 };
    assert.deepEqual(invalidGameFieldDimensionPaths(document), ['siteSizeWidth']);
    assert.throws(() => prepareSimpleLevelGif({ frameList: [] }, document), /editorSave\.fieldDimensions/);
    assert.equal(document.siteSizeWidth, value);
  }
  assert.equal(gameFieldDimensionForDisplay(128), 128);
  const old = { siteSizeWidth: 128, siteSizeHeight: 36, levels: [] };
  let writes = 0;
  await assert.rejects(saveSimpleGlobalConfigDocument({ api: { getGameEditor: async () => ({ data: structuredClone(old) }), saveGameEditor: async () => { writes++; } }, gameId: 1, patch: { name: 'old' }, liveDocument: old }), /editorSave\.fieldDimensions/);
  assert.equal(writes, 0); assert.equal(old.siteSizeWidth, 128);
  const result = prepareSimpleLevelGif({ frameList: [{ matrix: [{ x: 49, y: 49, color: 0, points: [[0, 0]] }] }] }, { siteSizeWidth: 50, siteSizeHeight: 50 });
  assert.equal(result.width, 50); assert.equal(result.height, 50); assert.equal(result.frames[0].pixels.length, 2500 * 4);
  assert.equal(result.frames[0].pixels.at(-3), 255);
});
