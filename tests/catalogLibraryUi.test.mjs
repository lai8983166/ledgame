import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderVisibleSlots } from '../src/lib/catalogOrdering.js';
import { filterMediaTree, visibleMediaRows } from '../src/lib/mediaSelectionTree.js';
import { spiritColorCss, createSpiritCreatePayload, createSpiritUpdatePayload } from '../src/lib/spiritPoints.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('reordering a filtered catalog replaces visible slots only, without mutating input', () => {
  const all = [1, 9, 2, 8].map(id => ({id}));
  assert.deepEqual(reorderVisibleSlots(all, [1, 2], 2, 1).map(x => x.id), [2, 9, 1, 8]);
  assert.deepEqual(all.map(x => x.id), [1, 9, 2, 8]);
  assert.deepEqual(reorderVisibleSlots(all, [1, 9, 2, 8], 1, 8).map(x => x.id), [9, 2, 8, 1]);
  assert.deepEqual(reorderVisibleSlots(all, [1, 2], 8, 1), all);
  assert.deepEqual(reorderVisibleSlots(all, [1, 2], 1, 1), all);
});

const file = (relativePath, mediaType) => ({kind:'file', name: relativePath.split('/').pop(), relativePath, mediaType});
const tree = [{kind:'directory', name:'A',relativePath:'A',children:[
  {kind:'directory',name:'B',relativePath:'A/B',children:[file('A/B/same.png','image')]}, file('A/music.mp3','audio')
]}, {kind:'directory',name:'C',relativePath:'C',children:[file('C/same.png','image')]},
{kind:'directory',name:'empty',relativePath:'empty',children:[]}];
test('media tree retains two-level ancestry, same-name paths and accept filtering', () => {
  const images = filterMediaTree(tree, 'image');
  assert.deepEqual(images.map(n => n.relativePath), ['A','C']);
  assert.deepEqual(visibleMediaRows(images, new Set(['A','A/B','C'])).map(n => [n.relativePath,n.depth]),
    [['A',0],['A/B',1],['A/B/same.png',2],['C',0],['C/same.png',1]]);
  assert.deepEqual(visibleMediaRows(images, new Set()).map(n=>n.relativePath), ['A','C']);
  assert.deepEqual(filterMediaTree(tree,'audio')[0].children.map(n=>n.relativePath), ['A/music.mp3']);
  assert.equal(tree[0].children.length,2);
});
test('sprite create includes chosen color, updates leave stored color alone and unknown color falls back', () => {
  for(let color=0;color<4;color++) assert.equal(createSpiritCreatePayload('test',2,2,[[1,1]],color).color,color);
  assert.equal(createSpiritCreatePayload('test',2,2,[]).color,0);
  assert.equal('color' in createSpiritUpdatePayload(2,2,[[1,1]]),false);
  assert.equal(new Set([0,1,2,3].map(spiritColorCss)).size,4);
  assert.equal(spiritColorCss(99),spiritColorCss(1));
});

test('category reorder preload and main IPC keep the same route and payload', async () => {
  let bridge, invocation;
  const source = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
  vm.runInNewContext(source, { require: name => {
    if (name !== 'electron') throw new Error(name);
    return { contextBridge:{exposeInMainWorld:(key, value)=>{if(key==='ledGame')bridge=value;}},
      ipcRenderer:{invoke:(...args)=>{invocation=args;},on:()=>{},removeListener:()=>{}} };
  }, process:{argv:[],env:{}}, window:{location:{search:''}}, URLSearchParams });
  bridge.reorderGameCategories([2,1]);
  assert.deepEqual(Array.from(invocation[1]), [2,1]); assert.equal(invocation[0],'game-categories:reorder');
  const main = await readFile(new URL('../electron/main.cjs', import.meta.url),'utf8');
  const registration = main.match(/ipcMain\.handle\('game-categories:reorder',[\s\S]*?\n\}\)\)/)[0];
  let handler, request;
  vm.runInNewContext(registration,{ipcMain:{handle:(_name,value)=>{handler=value;}},backendRequest:(...args)=>{request=args;}});
  handler(null,[2,1]);assert.equal(request[0],'/game-categories/display-order');
  assert.equal(request[1].method,'PUT'); assert.deepEqual(JSON.parse(request[1].body),{categoryIds:[2,1]});
});

test('image clear inventory leaves audio and other clear actions available', async () => {
  for (const file of ['components/GameInfoEditDialog.vue','components/GameCategoryEditDialog.vue','views/ApplicationSettingsView.vue']) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url),'utf8');
    const template = source.slice(source.indexOf('<template>'));
    assert.doesNotMatch(template,/games\.clearCover|@click="clearSecondaryBackground"|@click="clearSecondaryIdleMedia"/);
  }
  const simple = await readFile(new URL('../src/components/GameGlobalConfigDialog.vue',import.meta.url),'utf8');
  assert.match(simple,/<button\s+v-if="field.accept === 'audio'"[\s\S]*?@click="clearMedia\(field\)"/);
  const rank=await readFile(new URL('../src/views/RankGameEditorView.vue',import.meta.url),'utf8');
  const images=rank.slice(rank.indexOf('<section class="rank-media-group rank-media-image-group">'),rank.indexOf('<section class="rank-media-group rank-media-audio-group">'));
  assert.doesNotMatch(images, /clearMedia/);assert.match(rank.slice(rank.indexOf('<section class="rank-media-group rank-media-audio-group">')),/clearMedia/);
  assert.match(await readFile(new URL('../src/components/elc408/Elc408DebugToolsPanel.vue',import.meta.url),'utf8'),/@click="clearLogs"/);
  assert.match(await readFile(new URL('../src/views/LedGameTouchView.vue',import.meta.url),'utf8'),/touch\.clear/);
});
