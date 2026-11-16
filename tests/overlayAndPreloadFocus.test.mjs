import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from 'node:vm';
import { isComposingEvent } from '../src/lib/dialogInput.js';

const preload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
const globalDialog = await readFile(new URL("../src/components/GameGlobalConfigDialog.vue", import.meta.url), "utf8");
const infoDialog = await readFile(new URL("../src/components/GameInfoEditDialog.vue", import.meta.url), "utf8");

test("touch preload resynchronizes editable focus when the native window regains focus", () => {
  assert.match(preload, /window\.addEventListener\(['"]focus['"][\s\S]*reportEditableFocus\(document\.activeElement\)/);
});

test("parent dialogs ignore every keyboard event while their media picker is on top", () => {
  for (const source of [globalDialog, infoDialog]) {
    const start = source.indexOf('function handleKeydown(event)');
    const end = source.indexOf('\nonMounted', start);
    const functionEnd = source.indexOf('\nwatch(', start);
    const handler = source.slice(start, functionEnd > start && functionEnd < end ? functionEnd : end);
    const context = {
      props: { embedded: false }, picker: { value: {} }, pickerOpen: { value: true }, isComposingEvent,
      emit: () => assert.fail('parent must not close behind the picker'),
      close: () => assert.fail('parent must not close behind the picker'),
      dialogRef: { value: { querySelectorAll: () => assert.fail('parent must not trap picker focus') } },
      computed: () => ({}), draft: { value: {} },
    };
    vm.createContext(context);
    vm.runInContext(handler, context);
    for (const key of ['Escape', 'Tab']) context.handleKeydown({ key,
      preventDefault: () => assert.fail('parent must not consume picker keys') });
  }
});
