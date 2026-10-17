// Real EXE and backend, isolated database; --baseline records the old focus calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {_electron,expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const baseline=process.argv.includes('--baseline');
await mkdir(path.join(root,'.build'),{recursive:true});
const data=await mkdtemp(path.join(root,'.build/editor-flash-packaged-'));
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
const port=await freePort(),framePort=await freePort();
const env={...process.env,LED_USER_DATA_DIR:data,LED_PORTABLE_BACKEND_PORT:String(port),LED_DEBUG_TCP_PORT:String(framePort),LED_ROOM_CONNECTION_ENABLED:'false',ELC408_ENABLED:'false',LED_DISABLE_DEVTOOLS:'1'};
delete env.ELECTRON_RUN_AS_NODE;
let app,page;const records=[],errors=[];
const request=async(route,method='GET',body)=>{const response=await fetch(`http://127.0.0.1:${port}${route}`,{method,headers:{'content-type':'application/json'},body:body==null?undefined:JSON.stringify(body)});assert.equal(response.ok,true,await response.clone().text());return response.json();};
const button=name=>page.getByRole('button',{name,exact:true});
try {
  app=await _electron.launch({executablePath:path.join(root,'release/win-unpacked/LED Game.exe'),env,timeout:90000});
  await expect.poll(()=>{page=app.windows().find(page=>page.url().includes('/dist/index.html')&&!page.url().includes('window='));return Boolean(page);},{timeout:90000}).toBe(true);
  page.on('pageerror',error=>errors.push(error.message));await page.getByTestId('game-menu-button').waitFor();await page.bringToFront();await page.setViewportSize({width:1366,height:768});
  const doc=(await request('/games/draft','POST',{family:'entertainment'})).data;
  Object.assign(doc,{name:'闪屏隔离验收',cover:'cover.png',firstCatalog:'验收',siteSizeWidth:16,siteSizeHeight:36,
    audio:{scoreSound:'score.mp3',injurySound:'injury.mp3',purpleSound:'double.mp3'},gif:{standby:'idle.gif',gameFailure:'fail.gif',gameOver:'over.gif'},
    commonConfig:{gameStartAudio:'start.mp3',gameEndSuccessAudio:'success.mp3',gameEndFailAudio:'fail.mp3',levelPassAudio:'pass.mp3',levelRestartAudio:'restart.mp3'}});
  doc.levels=[{...doc.levels[0],label:'A',frameList:[{repeatTimes:1,matrix:[{id:'red',x:0,y:0,color:2,points:[[0,0]]}]}]}];
  const id=(await request('/game-editor','POST',doc)).data.gameId;
  await page.reload();await page.getByTestId('game-menu-button').click();await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
  const card=page.locator(`.game-card[data-id="${id}"]`);await card.hover();await card.getByRole('button',{name:'编辑',exact:true}).click();await page.locator('.simple-editor-fit-shell.ready').waitFor();
  await app.evaluate(({BrowserWindow})=>{
    globalThis.editorFocusCalls=[];
    const win=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().includes('/dist/index.html')&&!win.webContents.getURL().includes('window='));
    for(const name of ['setFocusable','moveTop','focus','show','restore']){const original=win[name];win[name]=function(...args){globalThis.editorFocusCalls.push(name);return original.apply(this,args);};}
  });
  for(const action of ['复制当前帧到后一帧','删除','撤销 RGB 编辑','重做 RGB 编辑']){
    // Select the copied red object through the actual object list before deleting.
    if(action==='删除'){
      await button('显示对象列表').click();await page.locator('.object-row').first().click();
    }
    await app.evaluate(()=>globalThis.editorFocusCalls=[]);
    const before=await page.locator('.editor-center').boundingBox();
    await button(action).click();await page.waitForTimeout(120);
    const calls=await app.evaluate(()=>globalThis.editorFocusCalls),after=await page.locator('.editor-center').boundingBox();
    records.push({action,calls,before,after});
    assert.deepEqual(after,before,action+' must not move the matrix panel');
    if(!baseline)assert.deepEqual(calls,[],action+' must not refocus/re-stack the native window');
    console.log(`${action}：置顶 ${calls.filter(call=>call==='moveTop').length} 次，聚焦 ${calls.filter(call=>call==='focus').length} 次`);
  }
  if(!baseline){
    await app.evaluate(()=>{const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(String(url).includes('/game-editor/')&&options?.method==='PUT')await new Promise(resolve=>setTimeout(resolve,500));return original(url,options);};});
    await button('保存').click();
    await expect(page.locator('html')).toHaveClass(/editor-saving/);
    assert.equal(await button('保存').evaluate(node=>getComputedStyle(node).cursor),'wait');
    await expect(button('保存')).toBeDisabled();
    await expect(page.locator('.editor-save-dialog h2')).toHaveText('保存成功');
    await expect(page.locator('html')).not.toHaveClass(/editor-saving/);
    await page.locator('.editor-save-dialog button').click();
    const input=page.locator('.editor-left input').first();await input.fill('仍能输入');assert.equal(await input.inputValue(),'仍能输入');
    records.push({action:'保存等待游标、结束恢复及弹窗后输入',passed:true});
  }
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(data,'验收.png')});
} finally {await app?.close();await writeFile(path.join(data,baseline?'修复前.json':'验收结果.json'),JSON.stringify({baseline,records,errors},null,2));console.log('隔离证据：'+data);}
