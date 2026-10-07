import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'../ledGame-platform/package.json'));
const {_electron}=require('playwright');const expect=require('@playwright/test').expect.configure({timeout:30000});
await mkdir(path.join(root,'.build'),{recursive:true});
const data=await mkdtemp(path.join(root,'.build/editor-debug-packaged-'));
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const backendPort=await port(),rgbPort=await port();
await mkdir(path.join(data,'settings'),{recursive:true});
await writeFile(path.join(data,'settings/application.json'),JSON.stringify({mode:'game',entryMethod:'touch'}));
const env={...process.env,LED_USER_DATA_DIR:data,LED_PORTABLE_BACKEND_PORT:String(backendPort),LED_DEBUG_TCP_PORT:String(rgbPort),
  LED_ROOM_CONNECTION_ENABLED:'false',ELC408_ENABLED:'false',LED_DISABLE_DEVTOOLS:'1',
  SPRING_APPLICATION_JSON:JSON.stringify({led:{outputs:[{name:'debug-panel',enabled:true,host:'127.0.0.1',port:rgbPort}]}})};
delete env.ELECTRON_RUN_AS_NODE;
let app,page;const passed=[];
const request=async(route,method='GET',body)=>{
  const response=await fetch(`http://127.0.0.1:${backendPort}${route}`,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(response.ok,true,await response.clone().text());return (await response.json()).data;
};
const state=()=>request('/engine/game/state');
const button=name=>page.getByRole('button',{name,exact:true});
try{
  app=await _electron.launch({executablePath:path.join(root,'release/win-unpacked/LED Game.exe'),env,timeout:90000});
  await expect.poll(()=>app.windows().some(w=>w.url().includes('/dist/index.html')&&!w.url().includes('window=')),{timeout:90000}).toBe(true);
  page=app.windows().find(w=>w.url().includes('/dist/index.html')&&!w.url().includes('window='));
  await page.locator('.game-category-heading').waitFor();
  const games=await request('/games/manageable');
  const simple=games.find(g=>g.name==='simple'),rank=games.find(g=>g.type==='rank');
  assert.ok(simple&&rank);
  const doc=await request(`/game-editor/${simple.gameId}`);
  doc.siteSizeWidth=16;doc.siteSizeHeight=36;doc.participants=2;doc.globalTimeLimit=true;doc.globalTimeLimitValue=60;
  doc.wiringData={runtimeEnabled:true,width:16,height:36,mode:'TURN_BACK_ROW_PRIORITY',maxPointsPerChannel:64,lines:[[[0,0],[1,0]]]};
  await request(`/game-editor/${simple.gameId}`,'PUT',doc);
  for(const game of [simple,rank]){
    await page.getByTestId('game-menu-button').click();await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
    await page.locator(`.game-card[data-id="${game.gameId}"] .game-card-main`).click();
    await button('地砖布线').click();await button('取消').click();
    await button('启动游戏').click();if(await page.getByRole('dialog').count())await button('使用已保存版本').click();
    await page.locator('.editor-debug-workspace').waitFor();
    assert.equal(app.windows().filter(w=>/window=(debug|touch)/.test(w.url())).length,0);
    await button('启动游戏').click();await expect.poll(async()=>(await state()).engineState).toBe('RUNNING');
    assert.equal((await state()).runtimeMode,'SIMULATION');
    await expect.poll(async()=>(await page.evaluate(()=>window.ledGame.latestFrame()))?.height).toBe((await state()).height);
    await button('暂停').click();const frozen=await state();await page.waitForTimeout(1100);
    assert.deepEqual((await state()).gameplay,frozen.gameplay);assert.deepEqual((await state()).gameTime,frozen.gameTime);
    if(game.type==='rank'){
      assert.ok(frozen.gameplay.remainingMillis>0);
      const remaining=frozen.gameTime?.mode==='LIMITED'
        ? Math.min(frozen.gameplay.remainingMillis,frozen.gameTime.remainingMillis):frozen.gameplay.remainingMillis;
      await expect(page.locator('.editor-debug-workspace dl dd').nth(4)).toHaveText(String(Math.ceil(remaining/1000)));
    }
    await page.screenshot({path:path.join(data,`${game.type==='rank'?'rank':'simple'}-暂停.png`)});
    await button('继续').click();const old=(await state()).sessionId;await button('重新开始').click();
    await expect.poll(async()=>(await state()).engineState).toBe('RUNNING');assert.notEqual((await state()).sessionId,old);
    await button('退出调试，返回编辑').click();
    await expect(page.locator('.editor-debug-workspace')).toHaveCount(0);
    await button('启动游戏').waitFor();
    await expect.poll(async()=>(await state()).engineState).toBe('STOPPED');
    passed.push(`${game.name}：真实 EXE 无新窗口、直接启动、真实 RGB、暂停恢复、重开、退出、返回编辑器`);
    if(game===simple)await button('返回列表').click();
  }
  await app.close();app=null;
  await expect.poll(async()=>{try{await state();return false;}catch{return true;}},{timeout:15000}).toBe(true);
  passed.push('退出真实 EXE 后内嵌后端释放');
  console.log(JSON.stringify({data,passed},null,2));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(data,'失败.png')});console.error('证据目录：'+data);throw error;}
finally{await app?.close();await writeFile(path.join(data,'验证记录.json'),JSON.stringify({passed},null,2));}
