import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isDebugRuntimeAvailable,debugLaunchPayload,appendDebugWristband,pixelsFromDebugFrame} from '../src/lib/editorDebugSession.js';
test('debug uses saved game, zero-based stage and fixed simulation without hijacking sessions/queue',()=>{
  for(const engineState of ['STARTING','RUNNING','SETTLING','PAUSED','PREPARING','STOPPING']) assert.equal(isDebugRuntimeAvailable({engineState}),false);
  assert.equal(isDebugRuntimeAvailable({engineState:'IDLE',queueSummary:{waiting:[{}]}}),false);
  assert.equal(isDebugRuntimeAvailable({engineState:'STOPPED'}),true);
  const game={id:1,minPlayers:1,maxPlayers:3,levels:[{},{}]};
  assert.deepEqual(debugLaunchPayload(game,{userCount:2,startLevel:2,launchMethod:'wristband',runtimeMode:'PRODUCTION'}),
    {gameId:1,userCount:2,startLevelIndex:1,launchMethod:'wristband',runtimeMode:'SIMULATION',stageFailurePolicy:'END_GAME'});
  assert.throws(()=>debugLaunchPayload(game,{userCount:4,startLevel:1}));
});
test('real scanner UIDs append only to owned preparation; duplicates/full/stale rejected',()=>{
  const state={engineState:'PREPARING',preparation:{sessionId:'ours',options:{userCount:2}},playerAccesses:[{access:{uid:'2283055618'}}]};
  assert.deepEqual(appendDebugWristband(state,'ours','12345'),['2283055618','12345']);
  for(const [id,uid] of [['other','12345'],['ours','abc'],['ours','2283055618']]) assert.throws(()=>appendDebugWristband(state,id,uid));
  state.preparation.options.userCount=1; assert.throws(()=>appendDebugWristband(state,'ours','12345'));
});
test('RGB uses actual field dimensions and refuses stale differently sized frames',()=>{
  assert.equal(pixelsFromDebugFrame({width:1,height:1,rgb:[1,2,3]},16,36),null);
  assert.deepEqual(pixelsFromDebugFrame({width:1,height:1,rgb:[1,2,3]},1,1),[[{r:1,g:2,b:3}]]);
});
