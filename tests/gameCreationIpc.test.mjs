import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
test('new draft IPC limits families without broadcasting a catalog mutation', async () => {
  const registration=main.match(/ipcMain\.handle\('game:new-draft',[\s\S]*?\n\}\)/)[0];
  let handler, fail=false;
  const requests=[], notifications=[];
  vm.runInNewContext(registration, {
    ipcMain:{handle:(_name,value)=>{handler=value;}},
    backendRequest:async(route,options)=>{requests.push([route,options]);if(fail)throw new Error('save failed');return{data:{id:null,type:'rank'}};},
    BrowserWindow:{getAllWindows:()=>[
      {isDestroyed:()=>false,webContents:{send:(...args)=>notifications.push(args)}},
      {isDestroyed:()=>true,webContents:{send:()=>assert.fail('destroyed window must not be used')}},
    ]},
  });
  await assert.rejects(handler(null,'multidimensional'),/不支持/);assert.equal(requests.length,0);
  await handler(null,'ranked');assert.equal(requests[0][0],'/games/draft');assert.equal(requests[0][1].method,'POST');
  assert.deepEqual(JSON.parse(requests[0][1].body),{family:'ranked'});
  assert.equal(notifications.length,0);
  fail=true;await assert.rejects(handler(null,'entertainment'),/save failed/);assert.equal(notifications.length,0);
});
test('first-save IPC broadcasts only when persistence succeeds, for both editors', async () => {
  for (const channel of ['game-editor','rank-game-editor']) {
    const start=main.indexOf(`ipcMain.handle('${channel}:create'`);
    const registration=main.slice(start,main.indexOf('\n})',start)+3);
    let handler, fail=false, saved=true;
    const requests=[], notifications=[];
    vm.runInNewContext(registration,{
      ipcMain:{handle:(_name,value)=>{handler=value;}},
      backendRequest:async(route,options)=>{requests.push([route,options]);if(fail)throw new Error('save failed');return{data:{gameId:5,saved}};},
      BrowserWindow:{getAllWindows:()=>[{isDestroyed:()=>false,webContents:{send:(...args)=>notifications.push(args)}}]},
    });
    await handler(null,{id:null,name:'Draft'});
    assert.equal(requests[0][0],`/${channel}`);assert.equal(requests[0][1].method,'POST');
    assert.equal(notifications.length,1);assert.equal(notifications[0][0],'game-catalog-changed');
    saved=false;await handler(null,{});assert.equal(notifications.length,1);
    fail=true;await assert.rejects(handler(null,{}),/save failed/);assert.equal(notifications.length,1);
  }
});
test('preload exposes fixed game-creation and library write routes', () => {
  const bridges={}, calls=[];
  vm.runInNewContext(preload, {
    require:()=>({contextBridge:{exposeInMainWorld:(name,value)=>{bridges[name]=value;}},
      ipcRenderer:{invoke:(...args)=>calls.push(args),on:()=>{},removeListener:()=>{}}}),
    window:{location:{search:''}},process:{platform:'win32',env:{}},URLSearchParams,
  });
  bridges.ledGame.newGameDraft('entertainment');bridges.ledGame.createGameEditor({id:null});bridges.ledGame.createRankGameEditor({id:null});
  bridges.mediaLibrary.upload('A/B');bridges.mediaLibrary.createFolder('A','new');
  assert.deepEqual(calls.map(args=>Array.from(args)),[
    ['game:new-draft','entertainment'],['game-editor:create',{id:null}],['rank-game-editor:create',{id:null}],
    ['media:upload','A/B'],['media:create-folder','A','new'],
  ]);
});
test('native upload cancellation does not copy, accepted selection uses the verified folder', async () => {
  const registration=main.match(/ipcMain\.handle\('media:upload',[\s\S]*?\n\}\)/)[0];
  let handler, canceled=true, copies=0, pickerOptions;
  vm.runInNewContext(registration, {
    ipcMain:{handle:(_name,value)=>{handler=value;}},getMediaRoot:()=>'/test-media',
    resolveLibraryFolder:async(_root,folder)=>({relative:folder}),
    showNativeDialogWithFocusRestore:async options=>{pickerOptions=options;return{canceled,filePaths:['/source/photo.png']};},
    importMediaFiles:async(_root,folder)=>{copies++;assert.equal(folder,'A/B');return{imported:['A/B/photo.png'],failures:[]};},
    BrowserWindow:{},dialog:{},imageExtensions:new Set(['.png']),videoExtensions:new Set(['.mp4']),audioExtensions:new Set(['.mp3']),
    isPreviewableMediaKind:()=>true,getMediaKind:()=> 'image',
  });
  assert.equal((await handler(null,'A/B')).canceled,true);assert.equal(copies,0);
  assert.equal(pickerOptions.method,'showOpenDialog');assert.ok(pickerOptions.options.properties.includes('multiSelections'));
  canceled=false;assert.equal((await handler(null,'A/B')).canceled,false);assert.equal(copies,1);
});
