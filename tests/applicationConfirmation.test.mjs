import assert from 'node:assert/strict';
import test from 'node:test';
import { effectScope } from 'vue';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { useConfirmationDialog } from '../src/lib/useConfirmationDialog.js';
import { deleteLevelAt } from '../src/lib/simpleLevelSequence.js';

function scopeFixture() {
  const scope = effectScope();
  return { scope, ...scope.run(() => useConfirmationDialog()) };
}

test('confirmation accepts once, rejects duplicate and stale replies, and does not queue dangerous actions', async () => {
  const f = scopeFixture();
  const first = f.confirmAction('Delete first?');
  const firstId = f.confirmation.value.id;
  assert.equal(await f.confirmAction('Delete twice?'), false);
  assert.equal(f.confirmation.value.message, 'Delete first?');
  f.resolveConfirmation(true, firstId + 1);
  assert.equal(f.confirmation.value.id, firstId);
  f.resolveConfirmation(true, firstId);
  assert.equal(await first, true);
  const next = f.confirmAction('Delete second?');
  f.resolveConfirmation(true, firstId);
  assert.notEqual(f.confirmation.value, null);
  f.resolveConfirmation(false);
  assert.equal(await next, false);
  f.scope.stop();
});

test('unmount resolves an outstanding confirmation as cancellation and rejects future requests', async () => {
  const f = scopeFixture();
  const pending = f.confirmAction('Delete?');
  f.scope.stop();
  assert.equal(await pending, false);
  assert.equal(f.confirmation.value, null);
  assert.equal(f.isConfirmationCurrent(), false);
  assert.equal(await f.confirmAction('After disposal?'), false);
});

const simpleSource = await readFile(new URL('../src/views/SimpleGameEditorView.vue', import.meta.url), 'utf8');
function sourceFunction(name, next) {
  const begin = simpleSource.indexOf(`async function ${name}(`);
  assert.ok(begin >= 0);
  const end = simpleSource.indexOf(`\nfunction ${next}(`, begin);
  assert.ok(end > begin);
  return simpleSource.slice(begin, end);
}
function deletionFixture() {
  let finish;
  const effects = [];
  const first = { label: 'first', frameList: [{ matrix: [] }] };
  const second = { label: 'second', frameList: [{ matrix: [] }] };
  const context = {
    document: { value: { levels: [first, second] } }, activeLevelIndex: { value: 0 },
    activeFrameIndex: { value: 0 }, busyAction: { value: '' }, anchorEditMode: { value: false },
    draggingLevelIndex: { value: null }, canDeleteActiveLevel: { value: true },
    confirmAction: () => new Promise(resolve => { finish = resolve; }), isConfirmationCurrent: () => true,
    t: key => key, deleteLevelAt, statusMessage: { value: '' },
    resetMatrixFrameCache: () => effects.push('cache'), clearRgbEditHistory: () => effects.push('history'),
    stopSelectionMode() {}, syncSelectedObject() {}, scheduleMatrixCacheWarmup() {},
  };
  vm.createContext(context);
  vm.runInContext(sourceFunction('deleteCurrentLevel', 'addFrame'), context);
  return { context, effects, first, second, finish: value => finish(value) };
}

test('deleting a level waits for confirmation; cancellation leaves document and history untouched', async () => {
  const f = deletionFixture();
  const pending = f.context.deleteCurrentLevel(0);
  assert.equal(f.context.document.value.levels.length, 2);
  assert.deepEqual(f.effects, []);
  f.finish(false);
  await pending;
  assert.equal(f.context.document.value.levels[0], f.first);
  assert.deepEqual(f.effects, []);
});

test('a late level confirmation cannot delete a replaced document or a different level at the old index', async () => {
  for (const replaceDocument of [true, false]) {
    const f = deletionFixture();
    const pending = f.context.deleteCurrentLevel(0);
    if (replaceDocument) f.context.document.value = { levels: [f.first, f.second] };
    else f.context.document.value.levels.reverse();
    f.finish(true);
    await pending;
    assert.equal(f.context.document.value.levels.length, 2);
    assert.deepEqual(f.effects, []);
  }
});

test('a valid confirmation removes its original level exactly once and preserves the remaining one', async () => {
  const f = deletionFixture();
  const pending = f.context.deleteCurrentLevel(0);
  f.finish(true);
  await pending;
  assert.equal(f.context.document.value.levels.length, 1);
  assert.equal(f.context.document.value.levels[0], f.second);
  assert.deepEqual(f.effects, ['cache', 'history']);
});

const touchSource = await readFile(new URL('../src/views/LedGameTouchView.vue', import.meta.url), 'utf8');
test('a late stop confirmation cannot stop a newly started session of the same game', async () => {
  let finish;
  const calls = [];
  const context = {
    runtimeState: { value: { gameId: 7, sessionId: 'old-session' } },
    confirmAction: () => new Promise(resolve => { finish = resolve; }),
    isConfirmationCurrent: () => true, t: key => key,
    runAction: async (_name, action) => action(), api: { stopTouchGame: () => calls.push('stop') },
  };
  const start = touchSource.indexOf('async function stopGame()');
  const end = touchSource.indexOf('\nfunction openExitKeypad(', start);
  vm.createContext(context);
  vm.runInContext(touchSource.slice(start, end), context);
  const pending = context.stopGame();
  context.runtimeState.value = { gameId: 7, sessionId: 'new-session' };
  finish(true);
  await pending;
  assert.deepEqual(calls, []);
});
