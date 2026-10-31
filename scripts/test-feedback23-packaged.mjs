// Actual release EXE, isolated copied database, settings and media directory.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {_electron,expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const data=await mkdtemp(path.join(root,'.build/feedback23-packaged-'));
const media=path.join(data,'media');await mkdir(media);await mkdir(path.join(data,'settings'));
await writeFile(path.join(media,'cover.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400"><rect width="200" height="400" fill="blue"/></svg>');
await writeFile(path.join(data,'settings/application.json'),JSON.stringify({applicationTitle:'23项反馈验收',touchExitPassword:'998877'}));
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const port=await freePort();
const env={...process.env,LED_USER_DATA_DIR:data,LED_MEDIA_DIR:media,LED_PORTABLE_BACKEND_PORT:String(port),LED_DEBUG_TCP_PORT:String(await freePort()),LED_ROOM_CONNECTION_ENABLED:'false',ELC408_ENABLED:'false',LED_DISABLE_DEVTOOLS:'1'};
delete env.ELECTRON_RUN_AS_NODE;delete env.LED_BACKEND_URL;delete env.VITE_DEV_SERVER_URL;
const request=async(route,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${port}${route}`,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};};
let app,page;const passed=[],errors=[];
const button=name=>page.getByRole('button',{name,exact:true});
const nav=name=>page.locator('.nav-tab').filter({hasText:new RegExp('^'+name+'$')});
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
try{
  app=await _electron.launch({executablePath:path.join(root,'release/win-unpacked/LED Game.exe'),env,timeout:90000});
  await expect.poll(()=>{page=app.windows().find(p=>p.url().includes('/dist/index.html')&&!p.url().includes('window='));return Boolean(page);},{timeout:90000}).toBe(true);
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.getByTestId('game-menu-button').waitFor();
  await expect.poll(()=>page.evaluate(async()=>(await window.ledGame.backendStatus()).status),{timeout:90000}).toBe('ready');
  await check('实际EXE无自动副屏，管理员密码IPC和导航品牌可用',async()=>{
    assert.equal(app.windows().some(p=>p.url().includes('window=secondary')),false);await expect(page.locator('.app-brand-title')).toHaveText('23项反馈验收');
    assert.equal((await page.evaluate(()=>window.appSettings.get())).touchExitPassword,'998877');
    await nav('配置').click();await expect(page.locator('input[maxlength="12"]')).toHaveValue('998877');
    await page.locator('input[maxlength="12"]').fill('12345678');await button('保存').click();await expect(page.locator('input[maxlength="12"]')).toHaveValue('12345678');
  });
  const category=(await request('/game-categories','POST',{name:'反馈有效分类',cover:'cover.svg'})).data;assert.ok(category?.id);
  const doc=(await request('/games/draft','POST',{family:'entertainment'})).data;
  Object.assign(doc,{name:'反馈23验收游戏',cover:'cover.svg',firstCatalog:String(category.id),siteSizeWidth:8,siteSizeHeight:8,
    audio:{scoreSound:'a.mp3',injurySound:'b.mp3',purpleSound:'c.mp3'},gif:{standby:'a.gif',gameFailure:'b.gif',gameOver:'c.gif'},
    commonConfig:{gameStartAudio:'a.mp3',gameEndSuccessAudio:'b.mp3',gameEndFailAudio:'c.mp3',levelPassAudio:'d.mp3',levelRestartAudio:'e.mp3'}});
  doc.levels=[{...doc.levels[0],option:{...doc.levels[0].option,rewardPoints:0,timeLimitMode:'UNLIMITED',lifeLimitMode:'UNLIMITED'},frameList:[{repeatTimes:1,matrix:[]},{repeatTimes:1,matrix:[]}]}];
  const id=(await request('/game-editor','POST',doc)).data.gameId;assert.ok(id);
  await check('打包后端拒绝超限和小数场地，原记录不变',async()=>{
    for(const value of [51,1.5]){const result=await request(`/game-editor/${id}`,'PUT',{...doc,siteSizeWidth:value});assert.ok(result.code!==200||result.data?.saved!==true,JSON.stringify(result));}
    assert.equal((await request(`/game-editor/${id}`)).data.siteSizeWidth,8);
  });
  async function openEditor(){
    assert.ok((await request('/games/manageable')).data.some(game=>(game.gameId??game.id)===id));
    // Test records were added through HTTP after startup, so reload the cached catalog.
    await page.reload();await page.getByTestId('game-menu-button').waitFor();
    await page.getByTestId('game-menu-button').click();await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
    const card=page.locator(`.game-card[data-id="${id}"]`);await card.hover();await card.getByRole('button',{name:'编辑',exact:true}).click();await page.locator('.simple-editor-fit-shell.ready').waitFor();
  }
  await openEditor();
  await check('打包编辑器整数步长校验，颜色名称和明亮图标',async()=>{
    const colors=await page.locator('.color-copy-button').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).color));assert.deepEqual(colors,['rgb(0, 255, 0)','rgb(64, 128, 255)','rgb(255, 64, 64)','rgb(255, 0, 255)']);
    assert.equal(await page.getByText('Color 0',{exact:true}).count(),0);await button('特效').click();const dialog=page.locator('.game-effect-dialog');
    const step=dialog.locator('label').filter({has:page.locator('span').filter({hasText:/^步长$/})}).locator('input');await step.fill('1.5');await dialog.locator('.game-effect-actions .primary').click();await dialog.getByText('步长必须是正整数',{exact:true}).waitFor();await dialog.getByRole('button',{name:'取消',exact:true}).click();
  });
  await check('真实IPC主窗关闭保留草稿和后端，保存后回读，再放弃退出全部',async()=>{
    await page.locator('.matrix-repeat-field input').fill('3');
    let w=await app.browserWindow(page);await w.evaluate(w=>w.close());await page.locator('.editor-leave-dialog').waitFor();await button('继续编辑').click();
    assert.ok(['IDLE','STOPPED'].includes((await request('/engine/game/state')).data.engineState));assert.equal(page.isClosed(),false);
    await button('保存').click();await page.locator('.editor-save-dialog button').click();assert.equal((await request(`/game-editor/${id}`)).data.levels[0].frameList[0].repeatTimes,3);
    await page.locator('.matrix-repeat-field input').fill('4');await nav('媒体库').click();await button('继续编辑').click();
    await page.screenshot({path:path.join(data,'打包编辑与品牌.png')});
    await page.evaluate(()=>window.secondaryDisplay.open());await expect.poll(()=>app.windows().some(p=>p.url().includes('window=secondary'))).toBe(true);
    const secondary=app.windows().find(p=>p.url().includes('window=secondary'));const sw=await app.browserWindow(secondary);await expect.poll(()=>sw.evaluate(w=>w.isFullScreen())).toBe(true);
    await page.bringToFront();w=await app.browserWindow(page);await w.evaluate(w=>w.close());const closed=app.waitForEvent('close',{timeout:30000});await button('不保存并离开').click();
    await closed;app=null;
    await expect.poll(async()=>{try{await request('/engine/game/state');return false;}catch{return true;}}).toBe(true);
  });
  assert.deepEqual(errors,[]);
}catch(error){errors.push(error.stack);await page?.screenshot({path:path.join(data,'失败.png')}).catch(()=>{});throw error;}
finally{
  if(app){try{await page.evaluate(()=>window.ledGame.onCloseRequested(({requestId})=>window.ledGame.respondToClose(requestId,true)));}catch{}await app.close().catch(()=>{});}
  await writeFile(path.join(data,'验证记录.json'),JSON.stringify({passed,errors},null,2));console.log('隔离证据：'+data);
}
