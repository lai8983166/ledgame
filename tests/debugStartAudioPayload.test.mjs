import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const normalize=vm.runInNewContext(source.slice(source.indexOf('function normalizeGameStartRequest(request)'),source.indexOf('function getMediaRoot()'))+'\nnormalizeGameStartRequest');

test('Electron launch normalization forwards the optional debug start-voice flag without changing old requests',()=>{
  assert.equal(normalize({gameId:1,userCount:2,runtimeMode:'SIMULATION',skipGameStartAudio:true}).skipGameStartAudio,true);
  for(const value of [undefined,false,'true',1])assert.equal(normalize({gameId:1,skipGameStartAudio:value}).skipGameStartAudio,false);
  assert.equal(normalize({gameId:1,userCount:2}).userCount,2);
});
