import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import focusModule from '../electron/window-focus.cjs';
const { restoreBrowserWindowFocus, showNativeDialogWithFocusRestore } = focusModule;

function fixture(overrides = {}) {
  const calls = [], immediate = [];
  const state = { focused: true, contentFocused: true, visible: true, minimized: false, destroyed: false, ...overrides };
  const targetWindow = {
    isDestroyed: () => state.destroyed, isMinimized: () => state.minimized,
    isVisible: () => state.visible, isFocused: () => state.focused, isFocusable: () => true,
    setFocusable: () => calls.push('setFocusable'), moveTop: () => calls.push('moveTop'),
    restore: () => { calls.push('restore');state.minimized = false; },
    show: () => { calls.push('show');state.visible = true; },
    focus: () => { calls.push('focus');state.focused = true; },
    webContents: { isDestroyed: () => false, isFocused: () => state.contentFocused,
      focus: () => { calls.push('webContents.focus');state.contentFocused = true; } },
  };
  return { calls, state, targetWindow, immediate, focusOptions: { setImmediateFn: fn => immediate.push(fn) } };
}

test('an already focused owner is not raised, toggled or focused repeatedly after a dialog', () => {
  const f = fixture();
  assert.equal(restoreBrowserWindowFocus(f.targetWindow, f.focusOptions), true);
  f.immediate.forEach(fn => fn());
  assert.deepEqual(f.calls, []);
});

test('lost native and renderer focus are restored once without moveTop or delayed native retries', () => {
  const f = fixture({ focused: false, contentFocused: false });
  restoreBrowserWindowFocus(f.targetWindow, f.focusOptions);f.immediate.forEach(fn => fn());
  assert.deepEqual(f.calls, ['focus', 'webContents.focus']);
});

test('the next message loop restores only missing renderer focus while the owner is still focused', () => {
  const f = fixture();restoreBrowserWindowFocus(f.targetWindow, f.focusOptions);
  f.state.contentFocused = false;f.immediate[0]();
  assert.deepEqual(f.calls, ['webContents.focus']);
  const switched = fixture();restoreBrowserWindowFocus(switched.targetWindow, switched.focusOptions);
  switched.state.focused = false;switched.state.contentFocused = false;switched.immediate[0]();
  assert.deepEqual(switched.calls, []);
});

test('hidden or minimized owners can be recovered, destroyed owners are ignored', () => {
  const f = fixture({ focused: false, contentFocused: false, visible: false, minimized: true });
  restoreBrowserWindowFocus(f.targetWindow, f.focusOptions);
  assert.deepEqual(f.calls, ['restore', 'show', 'focus', 'webContents.focus']);
  f.state.destroyed = true;f.immediate[0]();
  assert.equal(restoreBrowserWindowFocus(f.targetWindow, f.focusOptions), false);
});

for (const outcome of ['success', 'cancel', 'failure']) test(`native dialog ${outcome} keeps its owner and restores input without native churn`, async () => {
  const f = fixture({ contentFocused: false }), options = { title: 'save' }, dialogCalls = [];
  const result = showNativeDialogWithFocusRestore({
    BrowserWindow: { fromWebContents: () => f.targetWindow }, event: { sender: {} },
    dialog: { showSaveDialog: async (...args) => { dialogCalls.push(args);if (outcome === 'failure') throw Error('dialog failed');return { canceled: outcome === 'cancel' }; } },
    method: 'showSaveDialog', options, focusOptions: f.focusOptions,
  });
  if (outcome === 'failure') await assert.rejects(result, /dialog failed/);
  else assert.deepEqual(await result, { canceled: outcome === 'cancel' });
  f.immediate.forEach(fn => fn());
  assert.deepEqual(dialogCalls[0], [f.targetWindow, options]);
  assert.deepEqual(f.calls, ['webContents.focus']);
});

test('main process routes every file dialog through the focus-restoring boundary', async () => {
  const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /await dialog\.show(?:Save|Open)Dialog/);
  assert.equal((main.match(/showNativeDialogWithFocusRestore\(\{/g) || []).length, 10);
});
