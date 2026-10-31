// Source Electron main/preload, real embedded backend and isolated copied seed DB.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'../ledGame-platform/package.json'));
const {_electron}=require('playwright');
const expect=require('@playwright/test').expect.configure({timeout:30000});
await mkdir(path.join(root,'.build'),{recursive:true});
const data=await mkdtemp(path.join(root,'.build/feedback23-electron-'));
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
const backendPort=await port(),rgbPort=await port();
const executablePath=path.join(root,'node_modules/electron/dist/electron.exe');
const env={...process.env,LED_USER_DATA_DIR:data,LED_PORTABLE_BACKEND_PORT:String(backendPort),LED_DEBUG_TCP_PORT:String(rgbPort),LED_ROOM_CONNECTION_ENABLED:'false',ELC408_ENABLED:'false',LED_DISABLE_DEVTOOLS:'1'};
delete env.ELECTRON_RUN_AS_NODE;delete env.LED_BACKEND_URL;delete env.VITE_DEV_SERVER_URL;
await mkdir(path.join(data,'settings'),{recursive:true});
await writeFile(path.join(data,'settings/application.json'),JSON.stringify({touchExitPassword:'998877',entryMethod:'touch'}));
let app,page;const passed=[];
const state=async()=>{const r=await fetch(`http://127.0.0.1:${backendPort}/engine/game/state`);assert.ok(r.ok);return(await r.json()).data};
const mainAction=fn=>app.browserWindow(page).then(w=>w.evaluate(fn));
try{
  app=await _electron.launch({executablePath,args:[root],env,timeout:90000});
  await expect.poll(()=>app.windows().some(p=>p.url().includes('/dist/index.html')&&!p.url().includes('window=')),{timeout:90000}).toBe(true);
  page=app.windows().find(p=>p.url().includes('/dist/index.html')&&!p.url().includes('window='));
  await page.waitForFunction(()=>window.ledGame?.backendStatus);
  const initial=await page.evaluate(async()=>{
    const startup=await window.ledGame.backendStatus();
    window.__pendingCatalog=true;
    window.__catalogPromise=window.ledGame.listManageableGames().then(value=>{window.__pendingCatalog=false;return value});
    return startup;
  });
  assert.equal(initial.status,'starting');
  assert.equal(await mainAction(w=>w.isVisible()),true);
  assert.equal(await page.evaluate(()=>window.__pendingCatalog),true);
  await expect.poll(()=>page.evaluate(async()=>(await window.ledGame.backendStatus()).status),{timeout:90000}).toBe('ready');
  await page.evaluate(()=>window.__catalogPromise);
  assert.equal(app.windows().some(p=>p.url().includes('window=secondary')),false);
  passed.push('主窗口在后端starting时已显示，数据请求等待ready；启动没有副屏');

  const duplicate=spawn(executablePath,[root],{env,windowsHide:true,stdio:'ignore'});
  const duplicateExit=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('重复实例没有退出')),15000);duplicate.once('exit',code=>{clearTimeout(timer);resolve(code)});duplicate.once('error',reject)});
  assert.equal(duplicateExit,0);assert.equal(app.windows().filter(p=>p.url().includes('/dist/index.html')&&!p.url().includes('window=')).length,1);
  passed.push('相同userData重复启动只唤回原主窗口，不创建第二后端或主窗');

  await page.evaluate(()=>window.secondaryDisplay.open());
  await expect.poll(()=>app.windows().some(p=>p.url().includes('window=secondary'))).toBe(true);
  const secondary=app.windows().find(p=>p.url().includes('window=secondary'));
  await expect.poll(async()=>{const w=await app.browserWindow(secondary);return w.evaluate(w=>w.isFullScreen())}).toBe(true);
  passed.push('手动打开单屏副屏直接全屏');

  await page.evaluate(()=>window.ledGame.enterGameFlow());
  await expect.poll(()=>app.windows().some(p=>p.url().includes('window=touch'))).toBe(true);
  let touch=app.windows().find(p=>p.url().includes('window=touch'));
  await touch.waitForFunction(()=>window.ledGame?.exitTouchFullScreen);
  const prepare=await touch.evaluate(()=>window.ledGame.createPreparation());assert.equal(prepare.data.engineState,'PREPARING');
  assert.equal((await touch.evaluate(()=>window.ledGame.exitTouchFullScreen('000000'))).success,false);
  assert.equal(touch.isClosed(),false);
  await touch.evaluate(()=>window.ledGame.exitTouchFullScreen('998877')).catch(error=>{if(!touch.isClosed())throw error});
  await expect.poll(()=>touch.isClosed()).toBe(true);
  assert.equal((await state()).engineState,'IDLE');assert.equal(await mainAction(w=>w.isVisible()),true);
  passed.push('错误退出密码保留现场；正确密码先取消PREPARING再关闭Touch并返回主窗');

  // App now owns close approval. Dirty save/discard/stay is covered by the
  // editor UI and actual release tests, without installing competing listeners.
  const exited=app.waitForEvent('close',{timeout:30000});await mainAction(w=>w.close());await exited;
  await expect.poll(async()=>{try{await state();return false}catch{return true}}).toBe(true);
  passed.push('批准主窗关闭后，副屏及全部窗口关闭且嵌入后端退出');
  app=null;
  for(const mode of ['failure','close-during-startup']){
    const isolated=await mkdtemp(path.join(root,'.build/feedback23-electron-'+mode+'-'));
    const selectedPort=mode==='failure'?70000:await port();
    app=await _electron.launch({executablePath,args:[root],env:{...env,LED_USER_DATA_DIR:isolated,LED_PORTABLE_BACKEND_PORT:String(selectedPort),LED_DEBUG_TCP_PORT:String(await port())},timeout:90000});
    await expect.poll(()=>app.windows().some(p=>p.url().includes('/dist/index.html')&&!p.url().includes('window='))).toBe(true);
    page=app.windows().find(p=>p.url().includes('/dist/index.html')&&!p.url().includes('window='));
    await page.waitForFunction(()=>window.ledGame?.backendStatus);
    if(mode==='failure'){
      await expect.poll(()=>page.evaluate(async()=>(await window.ledGame.backendStatus()).status)).toBe('failed');
      const error=await page.evaluate(()=>window.ledGame.listManageableGames().then(()=>'',e=>e.message));
      assert.match(error,/游戏服务启动失败/);
      passed.push('后端启动失败终止加载并拒绝数据请求，主窗口仍可关闭');
    }else{
      assert.equal((await page.evaluate(()=>window.ledGame.backendStatus())).status,'starting');
    }
    const closed=app.waitForEvent('close',{timeout:30000});await mainAction(w=>w.close());await closed;
    if(mode==='close-during-startup'){
      await expect.poll(async()=>{try{const r=await fetch(`http://127.0.0.1:${selectedPort}/engine/game/state`,{signal:AbortSignal.timeout(500)});return !r.ok}catch{return true}}).toBe(true);
      passed.push('后端启动中关闭主窗可退出，不会在关窗后延迟启动后端');
    }
    app=null;
  }
  console.log(JSON.stringify({passed,data},null,2));
}finally{
  await writeFile(path.join(data,'验证记录.json'),JSON.stringify({passed},null,2));
  if(app){
    await app.close().catch(()=>{});
  }
}
