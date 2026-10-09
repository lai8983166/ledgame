import test from 'node:test';
import assert from 'node:assert/strict';
import {debugPeripheralBoard} from '../src/lib/debugPeripheralLights.js';
import {validateLevelOption} from '../src/lib/simpleLevelOptions.js';
const saved={selectedRow:'2|0',form:{open:1,order:0,topWallPixelLightNum:1,rightWallPixelLightNum:1,bottomWallPixelLightNum:1,leftWallPixelLightNum:1}};
test('saved multiwall layout renders black lights and follows reverse chain/start',()=>{
  const board=debugPeripheralBoard(saved,null,16,36);
  assert.equal(board.lights.length,4);
  assert.deepEqual(board.lights.map(light=>light.sequenceIndex),[2,1,0,3]);
  assert.ok(board.lights.every(light=>light.phase==='OFF'));
  assert.equal(debugPeripheralBoard({...saved,form:{...saved.form,open:0}},null,16,36),null);
});
test('runtime frozen positions override drafts and preserve authoritative sequence and alignment',()=>{
  const runtime={enabled:true,order:1,selectedRow:'1|0',lights:[{wall:1,index:0,sequenceIndex:5,alignX:0,alignY:0,phase:'BLUE',remaining:8}]};
  const board=debugPeripheralBoard(saved,runtime,16,36);
  assert.equal(board.lights.length,1);
  assert.equal(board.lights[0].sequenceIndex,5);
  assert.deepEqual(board.lights[0].align,{x:0,y:0});
  assert.equal(board.lights[0].remaining,8);
  assert.equal(debugPeripheralBoard(saved,{enabled:false,lights:[]},16,36),null);
});
test('circle countdown configuration rejects invalid integer ranges only when enabled',()=>{
  for(const [min,max] of [[0,2],[4,3],[1,100],[1.5,3],['',3],[1,undefined]]){
    assert.ok(validateLevelOption({pixelLightType:'1',countdownMin:min,countdownMax:max}).some(error=>error.field==='countdownMin'));
  }
  assert.deepEqual(validateLevelOption({pixelLightType:1,countdownMin:1,countdownMax:99}),[]);
  assert.deepEqual(validateLevelOption({pixelLightType:'0',countdownMin:0,countdownMax:100}),[]);
});
