import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEditorDeparture } from '../src/lib/editorLeaveGuard.js';
import { editorSnapshot } from '../src/lib/editorDirtyState.js';

test('unchanged documents leave without prompting and busy editors stay', async () => {
  assert.equal(await resolveEditorDeparture({hasUnsavedChanges:()=>false},()=>{throw Error('unexpected');}),true);
  assert.equal(await resolveEditorDeparture({canLeave:()=>false},()=>{throw Error('unexpected');}),false);
});
test('dirty departure respects stay, discard, confirmed save and failed save', async () => {
  let saves=0;
  const editor={hasUnsavedChanges:()=>true,saveForLeave:async()=>{saves++;return true;}};
  assert.equal(await resolveEditorDeparture(editor,async()=>'stay'),false);
  assert.equal(await resolveEditorDeparture(editor,async()=>'discard'),true);
  assert.equal(saves,0);
  assert.equal(await resolveEditorDeparture(editor,async()=>'save'),true);
  assert.equal(saves,1);
  editor.saveForLeave=async()=>false;
  assert.equal(await resolveEditorDeparture(editor,async()=>'save'),false);
  editor.saveForLeave=async()=>{throw Error('write failed');};
  assert.equal(await resolveEditorDeparture(editor,async()=>'save'),false);
});
test('cache versions do not make documents dirty but point and level changes do', () => {
  const doc={levels:[{frameList:[{__matrixVersion:0,matrix:[{points:[[0,0],[1,0]]}]}]}]};
  const before=editorSnapshot(doc);
  doc.levels[0].frameList[0].__matrixVersion++;
  assert.equal(editorSnapshot(doc),before);
  doc.levels[0].frameList[0].matrix[0].points.pop();
  assert.notEqual(editorSnapshot(doc),before);
});
