import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {setTimeout as delay} from 'node:timers/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createDebugFrameServer}=require('../electron/debug-frame-server.cjs');
const {inferFrameSize}=require('../electron/frame-size.cjs');
const source=await readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const packet=(color,width=16,height=36)=>{
  const bytes=Buffer.alloc(width*height*3,color),head=Buffer.alloc(5);
  head[0]=0x67;head.writeUInt32BE(bytes.length,1);return Buffer.concat([head,bytes]);
};
const connect=async port=>{const socket=net.connect(port,'127.0.0.1');await once(socket,'connect');return socket;};
const closed=socket=>new Promise(resolve=>socket.once('close',resolve));

test('occupied preferred port falls back to a still-bound receiver and real TCP frames reach renderer publication',async()=>{
  const blocker=net.createServer();blocker.listen(0,'127.0.0.1');await once(blocker,'listening');
  const messages=[];let ready;
  const next=new Promise(resolve=>ready=resolve);
  const context=vm.createContext({inferFrameSize,latestEngineState:{width:16,height:36},latestFrame:null,debugWindow:null,
    mainWindow:{isDestroyed:()=>false,webContents:{send:(channel,frame)=>{messages.push({channel,frame});if(messages.length===2)ready();}}}});
  vm.runInContext(source.slice(source.indexOf('function publishFrame(payload)'),source.indexOf('function publishEngineState(state)')),context);
  const receiver=createDebugFrameServer({isActivated:()=>true,onPayload:context.publishFrame});
  let socket;
  try{
    const preferred=blocker.address().port,port=await receiver.listen(preferred,true);
    assert.notEqual(port,preferred);assert.equal(await receiver.listen(preferred,true),port,'backend restart reuses bound receiver');
    socket=await connect(port);const first=packet(80),second=packet(160);
    socket.write(first.subarray(0,3));socket.write(Buffer.concat([first.subarray(3),second]));
    await next;
    assert.equal(messages[0].channel,'led-frame');
    assert.equal(messages[0].frame.width,16);assert.equal(messages[0].frame.height,36);
    assert.equal(messages[0].frame.rgb[0],80);assert.equal(messages[1].frame.rgb.at(-1),160);
    assert.ok(blocker.listening,'unrelated listener is untouched');
  }finally{socket?.destroy();await receiver.close();await new Promise(resolve=>blocker.close(resolve));}
});

test('unactivated connections and revoked sessions cannot publish frames; reactivation reuses the port',async()=>{
  let activated=false;const payloads=[];
  const receiver=createDebugFrameServer({isActivated:()=>activated,onPayload:payload=>payloads.push(Buffer.from(payload))});
  let socket;
  try{
    const port=await receiver.listen(0,true);
    socket=await connect(port);socket.on('error',()=>{});let ended=closed(socket);socket.write(packet(1));await ended;assert.equal(payloads.length,0);
    activated=true;socket=await connect(port);socket.on('error',()=>{});
    socket.write(packet(2));for(let i=0;i<100&&!payloads.length;i++)await delay(5);assert.equal(payloads[0]?.[0],2);
    activated=false;ended=closed(socket);receiver.disconnect();await ended;
    socket=await connect(port);socket.on('error',()=>{});ended=closed(socket);socket.write(packet(3));await ended;assert.equal(payloads.length,1);
    activated=true;assert.equal(await receiver.listen(0,true),port);
  }finally{socket?.destroy();await receiver.close();}
});

test('external backend mode reports an occupied fixed port instead of silently changing its receiver',async()=>{
  const blocker=net.createServer();blocker.listen(0,'127.0.0.1');await once(blocker,'listening');
  const receiver=createDebugFrameServer({isActivated:()=>true,onPayload:()=>{}});
  try{await assert.rejects(receiver.listen(blocker.address().port,false),{code:'EADDRINUSE'});}
  finally{await receiver.close();await new Promise(resolve=>blocker.close(resolve));}
});

test('embedded startup binds RGB before Java and passes the matching port to the default backend output',async()=>{
  const startup=source.slice(source.indexOf('async function startEmbeddedBackend()'),source.indexOf('async function restartEmbeddedBackend()'));
  assert.ok(startup.indexOf('await startFrameServer()')<startup.indexOf('childProcess.spawn(javaPath'));
  assert.match(startup,/LED_DEBUG_TCP_PORT: String\(framePort\)/);
  assert.match(source,/stopFrameServer\(shouldUseEmbeddedBackend && !quitCleanupStarted\)/);
  assert.match(await readFile(new URL('../../ledGame-backend/src/main/resources/application.yml',import.meta.url),'utf8'),/port: \$\{LED_DEBUG_TCP_PORT:3002\}/);
});
