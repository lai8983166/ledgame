// Release EXE + backend verification with an isolated user directory, database and media.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {_electron,expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
await mkdir(path.join(root,'.build'),{recursive:true});const data=await mkdtemp(path.join(root,'.build/feedback-libraries-packaged-'));
const media=path.join(data,'test-media');await mkdir(media);
await writeFile(path.join(media,'preview.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="800"><rect width="200" height="800" fill="#438abb"/></svg>');
await writeFile(path.join(media,'preview.wav'),Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=','base64'));
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
const port=await freePort(),framePort=await freePort();
const env={...process.env,LED_USER_DATA_DIR:data,LED_MEDIA_DIR:media,LED_PORTABLE_BACKEND_PORT:String(port),LED_DEBUG_TCP_PORT:String(framePort),LED_ROOM_CONNECTION_ENABLED:'false',ELC408_ENABLED:'false',LED_DISABLE_DEVTOOLS:'1'};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const records=[],errors=[];
const request=async(route,method='GET',body)=>{const response=await fetch(`http://127.0.0.1:${port}${route}`,{method,headers:{'content-type':'application/json'},body:body==null?undefined:JSON.stringify(body)});assert.equal(response.ok,true,await response.clone().text());return response.json();};
const button=name=>page.getByRole('button',{name,exact:true});
const tab=name=>page.locator('.nav-tab').filter({hasText:new RegExp('^'+name+'$')});
try{
  app=await _electron.launch({executablePath:path.join(root,'release/win-unpacked/LED Game.exe'),env,timeout:90000});
  await expect.poll(()=>{page=app.windows().find(p=>p.url().includes('/dist/index.html')&&!p.url().includes('window='));return Boolean(page);},{timeout:90000}).toBe(true);
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.getByTestId('game-menu-button').waitFor();await page.bringToFront();await page.setViewportSize({width:1366,height:768});
  await tab('精灵库').click();await page.locator('.spirit-heading .icon-add-button').click();
  const editor=page.locator('.spirit-editor-dialog');await editor.locator('.spirit-editor-name input').fill('反馈自定义精灵');
  await editor.locator('.spirit-editor-colors input[value="2"]').check();await editor.locator('.spirit-editor-size-controls input').nth(0).fill('3');await editor.locator('.spirit-editor-size-controls input').nth(1).fill('2');
  await editor.locator('.spirit-editor-canvas').click({position:{x:5,y:5}});await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});
  const spirit=(await request('/spirit')).data.find(item=>item.name==='反馈自定义精灵');assert.ok(spirit);assert.equal(spirit.color,2);
  const card=page.locator(`.spirit-thumbnail-card[data-id="${spirit.id}"]`);await expect(card).toHaveClass(/selected/);await expect(button('刷新')).toHaveCount(0);
  await card.hover();await card.getByRole('button',{name:'修改',exact:true}).click();await editor.locator('.spirit-editor-name input').fill('反馈改名精灵');await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});
  await expect(card.locator('strong')).toHaveText('反馈改名精灵');assert.equal((await request('/spirit')).data.find(item=>item.id===spirit.id).name,'反馈改名精灵');
  await card.hover();await page.screenshot({path:path.join(data,'精灵改名与卡片操作.png')});records.push({action:'真实EXE创建与改名经IPC持久化，卡片悬停维护与自动刷新',passed:true});
  const doc=(await request('/games/draft','POST',{family:'entertainment'})).data;
  Object.assign(doc,{name:'特效覆盖验收',cover:'preview.svg',firstCatalog:'反馈验收',siteSizeWidth:8,siteSizeHeight:8,
    audio:{scoreSound:'preview.wav',injurySound:'preview.wav',purpleSound:'preview.wav'},gif:{standby:'preview.svg',gameFailure:'preview.svg',gameOver:'preview.svg'},
    commonConfig:{gameStartAudio:'preview.wav',gameEndSuccessAudio:'preview.wav',gameEndFailAudio:'preview.wav',levelPassAudio:'preview.wav',levelRestartAudio:'preview.wav'}});
  doc.levels=[{...doc.levels[0],frameList:[{repeatTimes:7,matrix:[{id:'old',x:6,y:6,color:2,points:[[0,0]]}]}]}];
  const id=(await request('/game-editor','POST',doc)).data.gameId;
  await page.getByTestId('game-menu-button').click();await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
  const editGame=page.locator(`.game-card[data-id="${id}"]`).getByRole('button',{name:'编辑',exact:true});await editGame.focus();await editGame.click();await page.locator('.simple-editor-fit-shell.ready').waitFor();
  await page.locator('.sprite-color-filters input[value="2"]').check();await expect(button('反馈改名精灵')).toHaveCount(1);
  await button('特效').click();const effect=page.locator('.game-effect-dialog');await effect.locator('select').first().selectOption('overwrite');
  const step=effect.locator('label').filter({has:page.locator('span').filter({hasText:/^步长$/})}).locator('input');await step.press('ArrowUp');await expect(step).toHaveValue('2');await step.press('ArrowDown');await expect(step).toHaveValue('1');
  await effect.locator('label').filter({has:page.locator('span').filter({hasText:/^终点 X/})}).locator('input').fill('3');await effect.locator('.game-effect-actions .primary').click();await effect.waitFor({state:'hidden'});
  await button('保存').click();await expect(page.locator('.editor-save-dialog h2')).toHaveText('保存成功');await page.locator('.editor-save-dialog button').click();
  const saved=(await request(`/game-editor/${id}`)).data.levels[0].frameList;assert.equal(saved.length,3);assert.deepEqual(saved.map(frame=>frame.matrix.map(item=>[item.x,item.y])),[[[0,0]],[[1,0]],[[2,0]]]);
  records.push({action:'真实EXE自定义精灵颜色筛选与特效覆盖/补帧，保存后后端回读精确帧',passed:true});await button('返回列表').click();
  await tab('媒体库').click();await page.setViewportSize({width:1024,height:600});
  await page.locator('.media-tree-row').filter({hasText:'preview.svg'}).click();const image=page.locator('.media-preview-stage img');await expect.poll(()=>image.evaluate(node=>node.naturalWidth)).toBe(200);
  await image.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(data,'小屏图片.png')});
  const info=await image.evaluate(node=>{const r=node.parentElement.getBoundingClientRect();return{x:r.x,width:r.width,height:r.height,fit:getComputedStyle(node).objectFit};});assert.ok(info.x+info.width<=1024);assert.ok(Math.abs(info.width/info.height-1)<.02);assert.equal(info.fit,'contain');
  await page.locator('.media-tree-row').filter({hasText:'preview.wav'}).click();await page.locator('.media-preview-stage.audio').scrollIntoViewIfNeeded();
  const audio=await page.locator('.media-preview-stage.audio').evaluate(node=>{const r=node.getBoundingClientRect(),a=node.querySelector('audio').getBoundingClientRect();return{width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,a:{left:a.left,right:a.right,top:a.top,bottom:a.bottom}};});
  assert.ok(Math.abs(audio.width/audio.height-5.5)<.02);assert.ok(audio.a.left>=audio.left&&audio.a.right<=audio.right&&audio.a.top>=audio.top&&audio.a.bottom<=audio.bottom);await page.screenshot({path:path.join(data,'小屏音频.png')});
  records.push({action:'真实EXE隔离媒体协议预览，小屏图片和完整原生音频控件等比适配',passed:true});
  await tab('精灵库').click();await card.locator('.spirit-thumbnail-select').click();await card.hover();await card.getByRole('button',{name:'删除',exact:true}).click();await expect(card).toHaveCount(0);
  assert.ok(!(await request('/spirit')).data.some(item=>item.id===spirit.id));records.push({action:'真实EXE确认删除后自动刷新且后端记录移除',passed:true});assert.deepEqual(errors,[]);
}catch(error){errors.push(error.stack);await page?.screenshot({path:path.join(data,'失败.png')}).catch(()=>{});throw error;}finally{await app?.close();await writeFile(path.join(data,'验证记录.json'),JSON.stringify({records,errors},null,2));console.log('隔离证据：'+data);}
