import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMON_EDITOR_SPRITES, filterEditorSprites } from '../src/lib/simpleEditorSprites.js';

test('fixed common sprite names: twenty unique entries, stable order, no synthetic missing items',()=>{
  assert.equal(COMMON_EDITOR_SPRITES.length,20);
  assert.equal(new Set(COMMON_EDITOR_SPRITES).size,20);
  const library=COMMON_EDITOR_SPRITES.map((name,id)=>({id:id+1,name,width:3,height:2})).reverse();
  library.unshift({id:99,name:'非默认精灵',width:3,height:2});
  const before=structuredClone(library);
  assert.deepEqual(filterEditorSprites(library,'').map(s=>s.name),COMMON_EDITOR_SPRITES);
  assert.deepEqual(filterEditorSprites(library,'   ').map(s=>s.name),COMMON_EDITOR_SPRITES);
  assert.deepEqual(library,before);
  assert.deepEqual(filterEditorSprites([{id:1,name:'安全块'}],''),[{id:1,name:'安全块'}]);
});
test('exact dimensions filter all library entries, incomplete input never shows defaults',()=>{
  const library=[{name:'安全块',width:1,height:1},{name:'测试精灵',width:3,height:2}];
  assert.deepEqual(filterEditorSprites(library,'3 2'),[library[1]]);
  assert.deepEqual(filterEditorSprites(library,' 3   2 '),[library[1]]);
  for(const input of ['3','3 x 2','0 2','-3 2','3 2 1','9007199254740992 2'])assert.deepEqual(filterEditorSprites(library,input),[]);
});
