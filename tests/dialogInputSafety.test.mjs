import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { hasVisibleModalDialog, isComposingEvent } from '../src/lib/dialogInput.js';

const editorSource = await readFile(new URL('../src/views/SimpleGameEditorView.vue', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  let depth = 0;
  const body = source.indexOf('{', start);
  for (let index = body; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw Error(`Incomplete function ${name}`);
}

function keyboardEvent(key, overrides = {}) {
  let prevented = false;
  return { key, target: { tagName: 'SECTION' }, isComposing: false, repeat: false,
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    preventDefault: () => { prevented = true; }, stopPropagation() {},
    get prevented() { return prevented; }, ...overrides };
}

function editorFixture({ modal = false, hiddenModal = false, localModal = false, busy = false } = {}) {
  const calls = [];
  const context = {
    editorPage: { value: 'levels' }, busyAction: { value: busy ? 'save' : '' },
    levelMediaPicker: { value: null }, globalConfigOpen: { value: false }, gameWiringOpen: { value: false },
    pixelLightLayoutOpen: { value: false }, effectDialogOpen: { value: localModal },
    levelPreviewSnapshot: { value: null }, saveFeedback: { value: null },
    selectionMode: { value: false }, anchorEditMode: { value: false }, objectDragState: null,
    selectedObject: { value: { id: 'selected' } }, activeFrameIndex: { value: 1 },
    frames: { value: [{}, {}, {}] }, isComposingEvent, hasVisibleModalDialog,
    window: { document: { querySelectorAll: () => modal || hiddenModal
      ? [{ getClientRects: () => modal ? [{}] : [] }] : [] } },
    selectDrawingTool: value => calls.push(['tool', value]),
    deleteSelectedObject: () => calls.push(['delete']),
    moveSelectedObject: (...args) => calls.push(['move', ...args]),
    selectFrame: value => calls.push(['frame', value]),
    undoRgbEdit: () => { calls.push(['undo']); return true; },
    redoRgbEdit: () => { calls.push(['redo']); return true; },
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(editorSource, 'canTriggerGlobalShortcut') + '\n' +
    extractFunction(editorSource, 'handleGlobalKeydown'), context);
  return { calls, context, press: event => context.handleGlobalKeydown(event) };
}

const editorKeys = [
  ['Delete', {}], ['ArrowRight', {}], ['ArrowLeft', {}], ['ArrowUp', {}], ['ArrowDown', {}],
  ['a', {}], ['d', {}], ['z', { ctrlKey: true }], ['y', { ctrlKey: true }],
  ['z', { ctrlKey: true, shiftKey: true }], ['a', { altKey: true }], ['d', { altKey: true }],
];

test('every editor mutation shortcut is blocked while any visible modal owns the keyboard', () => {
  for (const state of [{ modal: true }, { localModal: true }, { busy: true }]) {
    const fixture = editorFixture(state);
    for (const [key, modifiers] of editorKeys) {
      const event = keyboardEvent(key, modifiers);
      fixture.press(event);
      assert.equal(event.prevented, false, `${key}: leave modal keyboard handling intact`);
    }
    assert.deepEqual(fixture.calls, [], JSON.stringify(state));
  }
});

test('hidden modals do not disable ordinary editor keyboard commands', () => {
  const fixture = editorFixture({ hiddenModal: true });
  for (const [key, modifiers] of editorKeys) fixture.press(keyboardEvent(key, modifiers));
  assert.equal(fixture.calls.length, editorKeys.length);
  assert.ok(fixture.calls.some(([action]) => action === 'delete'));
  assert.ok(fixture.calls.some(([action]) => action === 'frame'));
  assert.ok(fixture.calls.some(([action]) => action === 'undo'));
  assert.ok(fixture.calls.some(([action]) => action === 'redo'));
});

test('a successful save notification keeps editor shortcuts available', () => {
  const fixture = editorFixture();
  fixture.context.saveFeedback.value = { message: 'Saved successfully' };
  fixture.press(keyboardEvent('ArrowRight'));
  assert.equal(fixture.calls.length, 1);
});

test('native editable controls and composition keep their keyboard events', () => {
  const fixture = editorFixture();
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
    { tagName: 'AUDIO' }, { tagName: 'DIV', isContentEditable: true }]) {
    const event = keyboardEvent('z', { ctrlKey: true, target });
    fixture.press(event);
    assert.equal(event.prevented, false);
  }
  for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
    for (const [key, modifiers] of editorKeys) {
      const event = keyboardEvent(key, { ...modifiers, ...composition });
      fixture.press(event);
      assert.equal(event.prevented, false);
    }
  }
  assert.deepEqual(fixture.calls, []);
});

test('composition detection supports standard and legacy Windows IME events', () => {
  assert.equal(isComposingEvent({ isComposing: true }), true);
  assert.equal(isComposingEvent({ keyCode: 229 }), true);
  assert.equal(isComposingEvent({ keyCode: 27 }), false);
  assert.equal(isComposingEvent(undefined), false);
});

test('document-level navigation Escape cannot take focus from a modal or IME session', async () => {
  const source = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
  for (const state of [{ modal: true }, { isComposing: true }, { keyCode: 229 }]) {
    const calls = [];
    const document = { querySelectorAll: () => state.modal ? [{ getClientRects: () => [{}] }] : [] };
    const context = {
      document, hasVisibleModalDialog, isComposingEvent,
      gameMenuOpen: { value: true }, helpDocument: { value: null },
      helpMenuOpen: { value: true }, secondaryMenuOpen: { value: true },
      gameButtonRef: { value: { focus: () => calls.push('game-focus') } },
      helpButtonRef: { value: { focus: () => calls.push('help-focus') } },
      secondaryButtonRef: { value: { focus: () => calls.push('secondary-focus') } },
      closeHelpMenu: () => calls.push('help-close'), closeSecondaryMenu: () => calls.push('secondary-close'),
    };
    const handler = vm.runInNewContext(`(${extractFunction(source, 'onKeydown')})`, context);
    handler(keyboardEvent('Escape', state));
    assert.equal(context.gameMenuOpen.value, true);
    assert.deepEqual(calls, []);
  }
});

test('the navigation listener can still dismiss its own help document modal', async () => {
  const source = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
  const ownDialog = { getClientRects: () => [{}] };
  const calls = [];
  const handler = vm.runInNewContext(`(${extractFunction(source, 'onKeydown')})`, {
    document: { querySelectorAll: () => [ownDialog], querySelector: () => ownDialog },
    hasVisibleModalDialog, isComposingEvent, gameMenuOpen: { value: false },
    helpDocument: { value: { title: 'help' } }, closeHelpDocument: () => calls.push('close'),
  });
  handler(keyboardEvent('Escape'));
  assert.deepEqual(calls, ['close']);
});

const imeHandlers = [
  ['../src/components/SpiritPointEditorDialog.vue', 'handleKeydown'],
  ['../src/components/GameCategoryEditDialog.vue', 'handleKeydown'],
  ['../src/views/MediaLibraryView.vue', 'handleFolderKey'],
  ['../src/components/GameGlobalConfigDialog.vue', 'handleKeydown'],
  ['../src/components/GameEffectDialog.vue', 'handleKeydown'],
  ['../src/components/PixelLightLayoutDialog.vue', 'handleKeydown'],
  ['../src/components/MediaPickerDialog.vue', 'handleKeydown'],
  ['../src/components/GameActivationDialog.vue', 'onKeydown'],
];

for (const [file, name] of imeHandlers) test(`${file} ignores composition Escape and retains normal dismissal`, async () => {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const calls = [];
  const handler = vm.runInNewContext(`(${extractFunction(source, name)})`, {
    isComposingEvent, props: { embedded: false, saving: false }, pickerOpen: { value: false },
    picker: { value: null }, saveError: { value: null }, audioPlayer: { value: null },
    emit: name => calls.push(name), close: () => calls.push('close'),
    closeFolderDialog: () => calls.push('close-folder'),
  });
  handler(keyboardEvent('Escape', { isComposing: true }));
  handler(keyboardEvent('Escape', { keyCode: 229 }));
  assert.deepEqual(calls, [], 'IME candidate cancellation must not dismiss the form');
  handler(keyboardEvent('Escape'));
  assert.equal(calls.length, 1, 'ordinary Escape still dismisses normally');
});
