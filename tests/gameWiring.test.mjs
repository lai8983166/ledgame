import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameWiringDraft, serializeGameWiring, saveGameWiring, parseWiringFile } from '../src/lib/gameWiring.js';

test('wiring file round trip preserves channel slots and point order; importing never mutates the current draft', () => {
  const current = {...createGameWiringDraft(null, 3, 2), mode:'SINGLE_COL_PRIORITY', maxPointsPerChannel:2,
    lines:[[[2,1],[0,0]],[],[[1,0]]], activeChannelIndex:2};
  const before=structuredClone(current);
  const exported=serializeGameWiring(current);
  const result=parseWiringFile('\uFEFF'+JSON.stringify(exported),current);
  assert.deepEqual(serializeGameWiring(result),exported);
  assert.equal(result.activeChannelIndex,0);
  result.lines[0][0][0]=0;
  assert.deepEqual(current,before);
  const legacy={width:3,height:2,maxPointsPerChannel:2,lines:[[[0,1]],[]]};
  assert.equal(parseWiringFile(JSON.stringify(legacy),current).mode,current.mode);
});

test('invalid or differently sized wiring files leave the draft untouched; standalone tools may load file dimensions', () => {
  const current=createGameWiringDraft(null,3,2),before=structuredClone(current);
  const valid=serializeGameWiring(current);
  for(const content of ['bad','null','[]','{}',JSON.stringify({...valid,mode:'bad'}),
    JSON.stringify({...valid,lines:{length:1}}),JSON.stringify({...valid,lines:[[[0,0],[0,0]]]}),
    JSON.stringify({...valid,lines:[[[3,0]]]}),JSON.stringify({...valid,maxPointsPerChannel:1,lines:[[[0,0],[1,0]]]}),
    JSON.stringify({...valid,width:4})])assert.throws(()=>parseWiringFile(content,current));
  assert.deepEqual(current,before);
  assert.equal(parseWiringFile(JSON.stringify({...valid,width:4}),current,false).width,4);
});

test('legacy examples are not runtime defaults, a compatible global draft is copied without mutations', () => {
  const global = { width: 2, height: 1, maxPointsPerChannel: 64, lines: [[[1,0],[0,0]]] };
  const draft = createGameWiringDraft({ lines: [[[0,0]]] }, 2, 1, global);
  assert.deepEqual(draft.lines, global.lines);
  draft.lines[0][0][0] = 0;
  assert.equal(global.lines[0][0][0], 1);
  assert.deepEqual(createGameWiringDraft(null, 8, 8, global).lines, [[]]);
});
test('explicit saved mappings keep channel slots, modes, and reject duplicates/out of bounds/capacity', () => {
  const saved = {runtimeEnabled:true,width:2,height:1,mode:'TURN_BACK_COL_PRIORITY',maxPointsPerChannel:64,lines:[[[1,0]],[]]};
  const draft = createGameWiringDraft(saved,2,1);
  assert.equal(serializeGameWiring(draft).runtimeEnabled,true);
  assert.equal(serializeGameWiring(draft).mode,saved.mode);
  assert.equal(serializeGameWiring(draft).lines.length,2);
  for (const lines of [[[[1,0],[1,0]]],[[[2,0]]],[[[0]]]]) {
    assert.throws(() => serializeGameWiring({...draft,lines}));
  }
  assert.throws(() => serializeGameWiring({...draft,maxPointsPerChannel:171}));
  assert.throws(() => serializeGameWiring(createGameWiringDraft(saved,1,1)));
});
test('independent save uses persisted game, does not accidentally commit RGB drafts, failure preserves live data', async () => {
  const stored={id:1,name:'stored',siteSizeWidth:2,siteSizeHeight:1,levels:[{label:'stored'}],wiringData:{runtimeEnabled:false}};
  const live={...stored,levels:[{label:'unsaved'}]};
  const wiring=serializeGameWiring(createGameWiringDraft(null,2,1));
  let submitted;
  const api={getGameEditor:async()=>({data:structuredClone(stored)}),saveGameEditor:async(id,doc)=>{submitted=doc;return {data:{saved:true}};}};
  await saveGameWiring(api,1,false,wiring,live);
  assert.equal(submitted.levels[0].label,'stored');
  assert.equal(live.levels[0].label,'unsaved');
  assert.deepEqual(live.wiringData,wiring);
  const before=structuredClone(live);
  api.saveGameEditor=async()=>{throw new Error('disk full');};
  await assert.rejects(saveGameWiring(api,1,false,{...wiring,mode:'SINGLE_ROW_PRIORITY'},live));
  assert.deepEqual(live,before);
});
