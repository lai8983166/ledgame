import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {createBackendReadiness,createCloseApproval,finishTouchSession}=require('../electron/application-lifecycle.cjs');
const preload=await readFile(new URL('../electron/preload.cjs',import.meta.url),'utf8');
const main=await readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');

test('repeated app.quit cannot bypass pending backend cleanup',async()=>{
  const start=main.indexOf("app.on('before-quit'");
  const source=main.slice(start,main.indexOf('\nasync function releaseElc408LogCapture',start));
  let handler,release,stopped=0,quit=0,prevented=0;
  const context={app:{on:(_name,fn)=>{handler=fn},quit:()=>quit++},quitCleanupStarted:false,quitCleanupFinished:false,
    mainCloseApproved:true,mainWindow:{isDestroyed:()=>false},startupAbortController:{abort:()=>{}},
    backendReadiness:{get:()=>({status:'ready'}),fail:()=>{}},splashLifecycle:{close:()=>{}},
    stopRuntimeStateStream:()=>{},stopFrameServer:()=>{},stopEmbeddedBackend:()=>stopped++,
    releaseElc408LogCapture:()=>new Promise(resolve=>{release=resolve}),setTimeout:()=>{},
  };
  vm.runInNewContext(source,context);
  const event={preventDefault:()=>prevented++};handler(event);handler(event);
  assert.equal(prevented,2);assert.equal(stopped,0);assert.equal(quit,0);
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(stopped,1);assert.equal(quit,1);
  handler(event);assert.equal(prevented,2);
});

test('backend calls wait for one shared startup, then proceed together',async()=>{
  const changes=[],gate=createBackendReadiness(value=>changes.push(value));
  let calls=0;
  const waiting=[gate.wait().then(()=>calls++),gate.wait().then(()=>calls++)];
  await Promise.resolve();assert.equal(calls,0);assert.equal(gate.get().status,'starting');
  gate.complete();await Promise.all(waiting);
  assert.equal(calls,2);assert.deepEqual(changes,[{status:'ready',message:''}]);
});
test('startup failure rejects queued and later calls instead of waiting forever',async()=>{
  const gate=createBackendReadiness();
  const waiting=assert.rejects(gate.wait(),/启动失败/);
  gate.fail(new Error('启动失败'));await waiting;
  await assert.rejects(gate.wait(),/启动失败/);
  gate.complete();assert.equal(gate.get().status,'failed');
});
test('close approval coalesces native close requests and rejects stale replies',async()=>{
  const sent=[],approval=createCloseApproval({isAvailable:()=>true,send:value=>sent.push(value)});
  const first=approval.request();assert.equal(approval.request(),first);assert.equal(sent.length,1);
  assert.equal(approval.respond(sent[0].requestId+1,true),false);
  approval.respond(sent[0].requestId,false);assert.equal(await first,false);
  const second=approval.request();assert.equal(sent.length,2);
  assert.equal(approval.respond(sent[0].requestId,true),false);
  approval.respond(sent[1].requestId,true);assert.equal(await second,true);
});
test('closing before renderer loads is allowed and destroyed renderer cancels pending approval',async()=>{
  const early=createCloseApproval({isAvailable:()=>false,send:()=>assert.fail('no renderer')});
  assert.equal(await early.request(),true);
  const approval=createCloseApproval({isAvailable:()=>true,send:()=>{}});
  const pending=approval.request();approval.cancel();assert.equal(await pending,false);
});
test('Touch exit cancels pending preparation, stops an active game and preserves failures',async()=>{
  const calls=[],cancelPreparation=async id=>calls.push(['cancel',id]),stopGame=async()=>calls.push(['stop']);
  await finishTouchSession({state:{engineState:'PREPARING',preparation:{sessionId:'p1'}},cancelPreparation,stopGame});
  await finishTouchSession({state:{engineState:'RUNNING'},cancelPreparation,stopGame});
  await finishTouchSession({state:{engineState:'IDLE'},cancelPreparation,stopGame});
  assert.deepEqual(calls,[['cancel','p1'],['stop']]);
  await assert.rejects(finishTouchSession({state:{engineState:'PREPARING',preparation:{sessionId:'p1'}},cancelPreparation:async()=>{throw new Error('拒绝取消')},stopGame}),/拒绝取消/);
});

function bridgeFixture(){
  const apis={},events=new Map(),sent=[];let failure='';
  vm.runInNewContext(preload,{URLSearchParams,window:{location:{search:''}},process:{platform:'win32',env:{}},
    require:()=>({contextBridge:{exposeInMainWorld:(name,value)=>{apis[name]=value}},ipcRenderer:{
      invoke:async()=>{if(failure)throw new Error(failure);return 'ok'},
      on:(name,fn)=>events.set(name,fn),removeListener:name=>events.delete(name),send:(...args)=>sent.push(args),
    }}),
  });
  return {apis,events,sent,fail:message=>{failure=message}};
}
test('preload normalizes IPC errors and common validation while preserving specific Chinese reasons',async()=>{
  const f=bridgeFixture();
  for(const [input,expected] of [
    ["Error invoking remote method 'app-settings:update': Error: Touch exit password must contain 4 to 12 digits",'退出密码需为4～12位数字'],
    ["Error invoking remote method 'game-categories:create': Error: BAD_REQUEST: 游戏分类名称已存在: 新分类",'游戏分类名称已存在: 新分类'],
    ["Error invoking remote method 'media:create-folder': Error: 文件夹名称无效，请勿使用路径、特殊字符或系统保留名称",'文件夹名称无效，请勿使用路径、特殊字符或系统保留名称'],
    ["Error invoking remote method 'media:create-folder': Error: EEXIST: file already exists, mkdir 'private-path'",'同名文件或文件夹已存在'],
  ]){
    f.fail(input);await assert.rejects(f.apis.appSettings.update({}),error=>error.message===expected);
  }
  f.fail("Error invoking remote method 'elc408:reload': Error: ELC408_RUNTIME_DISABLED: SDK 未启用");
  await assert.rejects(f.apis.elc408Tools.reload(),error=>error.message==='ELC408_RUNTIME_DISABLED: SDK 未启用');
});
test('close/status preload subscriptions preserve callback and unsubscribe contracts',()=>{
  const f=bridgeFixture(),received=[];
  const off=f.apis.ledGame.onCloseRequested(value=>received.push(value));
  f.events.get('window:close-requested')(null,{requestId:7});
  f.apis.ledGame.respondToClose(7,true);
  assert.equal(received[0].requestId,7);assert.deepEqual(Array.from(f.sent.at(-1)),['window:close-response',7,true]);
  off();assert.equal(f.events.has('window:close-requested'),false);
  const statusOff=f.apis.ledGame.onBackendStatus(value=>received.push(value));
  f.events.get('backend-status-changed')(null,{status:'ready'});assert.equal(received[1].status,'ready');
  statusOff();assert.equal(f.events.has('backend-status-changed'),false);
});
