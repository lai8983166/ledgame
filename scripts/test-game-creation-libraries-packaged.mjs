// Real packaged UI, IPC and backend. All database/media writes are isolated.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { _electron, expect } = createRequire(path.join(root, '../ledGame-platform/package.json'))('@playwright/test');
await mkdir(path.join(root, '.build'), { recursive:true });
const data = await mkdtemp(path.join(root, '.build/game-creation-packaged-'));
const media = path.join(data, 'media'), source = path.join(data, 'external.svg');
await mkdir(media);
const sourceBytes = '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"><rect width="3" height="2" fill="lime"/></svg>';
await writeFile(source, sourceBytes);
const server = net.createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port = server.address().port;await new Promise(resolve=>server.close(resolve));
const env = { ...process.env, LED_USER_DATA_DIR:data, LED_MEDIA_DIR:media, LED_DEBUG_TCP_PORT:'0',
  LED_PORTABLE_BACKEND_PORT:String(port), LED_ROOM_CONNECTION_ENABLED:'false', ELC408_ENABLED:'false', LED_DISABLE_DEVTOOLS:'1' };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const passed = [], errors = [], createdIds = [];
const api = (method,...args) => page.evaluate(([method,args])=>window.ledGame[method](...args),[method,args]);
async function launch() {
  app = await _electron.launch({executablePath:path.join(root,'release/win-unpacked/LED Game.exe'), env, timeout:90_000});
  await expect.poll(()=>{
    page=app.windows().find(window=>window.url().includes('/dist/index.html')&&!window.url().includes('window='));
    return Boolean(page);
  },{timeout:90_000}).toBe(true);
  page.on('pageerror',error=>errors.push(error.message));await page.locator('.app-nav').waitFor();
}
async function selectList() {
  await page.getByTestId('game-menu-button').click();
  await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
  await page.getByRole('button',{name:'新建游戏',exact:true}).waitFor();
}
try {
  await launch(); await selectList();
  const before = (await api('listManageableGames')).data;
  await page.getByRole('button',{name:'新建游戏',exact:true}).click();
  await page.screenshot({path:path.join(data,'新建游戏类型.png')});
  assert.equal(await page.locator('.game-creation-dialog').getByRole('button',{name:/多维竞技/}).isDisabled(),true);
  await page.keyboard.press('Escape'); assert.equal((await api('listManageableGames')).data.length,before.length);
  async function openDraft(family) {
    await page.getByRole('button',{name:'新建游戏',exact:true}).click();
    await page.locator('.game-creation-dialog').getByRole('button',{name:family==='ranked'?/排位赛/:/娱乐挑战/}).click();
    await page.locator('.game-creation-dialog footer .primary').click();
    await page.locator(family==='ranked'?'.rank-editor input[data-rank-field="name"]':'.simple-editor-layout .editor-left input').first().waitFor();
  }
  for (const family of ['entertainment','ranked']) {
    await openDraft(family);
    assert.equal((await api('listManageableGames')).data.length,before.length);
    await selectList();
    assert.equal((await api('listManageableGames')).data.length,before.length);
  }
  passed.push('两类草稿进入编辑器及未保存退出均不创建记录或卡片');
  for (const family of ['entertainment','ranked']) {
    await openDraft(family);
    const rank = family === 'ranked';
    const countBefore=before.length+createdIds.length;
    assert.equal((await api('listManageableGames')).data.length,countBefore);
    const debugButton=rank?page.locator('.rank-actions').getByRole('button',{name:'启动游戏',exact:true}):page.locator('.editor-toolbar').getByRole('button',{name:'启动游戏',exact:true});
    assert.equal(await debugButton.count(),0);
    if (!rank) {
      await page.locator('.editor-toolbar').getByRole('button',{name:'全局配置',exact:true}).click();
      await page.locator('.global-config-field').filter({has:page.locator('.global-config-label').filter({hasText:/^名称$/})}).locator('input').fill('配置草稿');
      await page.locator('.global-config-dialog select').filter({has:page.locator('option[value="true"]')}).selectOption('true');
      await page.locator('.global-config-field').filter({has:page.locator('.global-config-label').filter({hasText:/^整局生命值$/})}).locator('input').fill('20');
      await page.locator('.global-config-actions .primary').click();await page.locator('.global-config-dialog').waitFor({state:'hidden'});
      await page.locator('.editor-toolbar').getByRole('button',{name:'符号灯布局',exact:true}).click();
      await page.locator('.pixel-layout-actions .primary').click();await page.locator('.pixel-layout-dialog').waitFor({state:'hidden'});
    }
    await page.getByRole('button',{name:'地砖布线',exact:true}).click();
    await page.locator('.game-wiring-dialog .elc408-actions .primary').click();await page.locator('.game-wiring-dialog').waitFor({state:'hidden'});
    assert.equal((await api('listManageableGames')).data.length,countBefore,'configuration dialogs must not persist the draft');
    const input=rank?page.locator('.rank-editor input[data-rank-field="name"]'):page.locator('.simple-editor-layout .editor-left input').first();
    const button=rank?page.locator('.rank-actions .primary'):page.locator('.editor-toolbar').getByRole('button',{name:'保存',exact:true});
    await input.fill('');await button.click();await page.locator('.error-line').filter({hasText:/名称|name/}).waitFor();
    assert.equal((await api('listManageableGames')).data.length,countBefore,'a failed first save must not create a row');
    await input.fill(`打包验收-${family}`);
    await button.click();
    let game;
    await expect.poll(async()=>{
      game=(await api('listManageableGames')).data.find(item=>item.name===`打包验收-${family}`);
      return Boolean(game);
    }).toBe(true);
    createdIds.push(game.gameId);
    assert.equal(await debugButton.count(),0);
    const firstSaved=(await api(rank?'getRankGameEditor':'getGameEditor',game.gameId)).data;
    assert.equal(firstSaved.wiringData.runtimeEnabled,true);
    if (!rank) {
      assert.equal(firstSaved.globalLifeLimit,true);
      assert.equal(firstSaved.globalLifeLimitValue,20);
      passed.push('闯关模式及整局生命 20 经真实 IPC、首次创建接口正确落库，符号灯和布线保存不重置模式');
    }
    await input.fill(`再次保存-${family}`);await button.click();
    await expect.poll(async()=> (await api(rank?'getRankGameEditor':'getGameEditor',game.gameId)).data.name).toBe(`再次保存-${family}`);
    assert.equal((await api('listManageableGames')).data.length,countBefore+1,'subsequent saves must update the same ID');
    await input.fill(`打包验收-${family}`);await button.click();
    await expect.poll(async()=> (await api(rank?'getRankGameEditor':'getGameEditor',game.gameId)).data.name).toBe(`打包验收-${family}`);
    await page.screenshot({path:path.join(data,`新建-${family}.png`)});
    await selectList();await page.locator(`.game-card[data-id="${game.gameId}"]`).waitFor();
    assert.equal(await page.locator(`.game-card[data-id="${game.gameId}"]`).count(),1);
  }
  passed.push('两类草稿的配置保存不入库、首次保存失败可重试、首次保存后生成卡片、后续保存不重复创建');

  await page.locator('.nav-tab').filter({hasText:'媒体库'}).click();
  await page.getByRole('button',{name:'新建文件夹',exact:true}).click();await page.locator('.media-folder-dialog input').fill('验收目录');
  await page.locator('.media-folder-dialog .primary').click();await page.locator('.media-folder-dialog').waitFor({state:'hidden'});
  // Replace only the native picker in this test-owned process, never production code.
  await app.evaluate(({dialog}, source)=>{
    globalThis.__originalMediaPicker=dialog.showOpenDialog;
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
  },source);
  try {
    await page.getByRole('button',{name:'上传文件',exact:true}).click();await page.getByText('external.svg',{exact:true}).waitFor();
    assert.equal(await readFile(path.join(media,'验收目录/external.svg'),'utf8'),sourceBytes);
    await page.getByRole('button',{name:'上传文件',exact:true}).click();await page.getByText('external (1).svg',{exact:true}).waitFor();
    assert.equal(await readFile(path.join(media,'验收目录/external.svg'),'utf8'),sourceBytes);
    assert.equal(await readFile(path.join(media,'验收目录/external (1).svg'),'utf8'),sourceBytes);
    await page.getByText('external.svg',{exact:true}).click();await page.locator('.media-preview-stage img').waitFor();
    await expect.poll(()=>page.locator('.media-preview-stage img').evaluate(img=>img.complete&&img.naturalWidth===3)).toBe(true);
    await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});
    await page.getByRole('button',{name:'上传文件',exact:true}).click();
    assert.equal((await page.evaluate(async()=> (await window.mediaLibrary.list()).items[0].children.length)),2);
  } finally {
    await app.evaluate(({dialog})=>{dialog.showOpenDialog=globalThis.__originalMediaPicker;delete globalThis.__originalMediaPicker;});
  }
  passed.push('打包版目录创建、实际文件复制、同名保留、媒体协议预览、取消上传');
  await page.screenshot({path:path.join(data,'媒体上传.png')});

  await page.locator('.nav-tab').filter({hasText:'精灵库'}).click();
  await page.locator('.spirit-thumbnail-card').first().waitFor();
  assert.equal(await page.locator('.spirit-preview-stage').count(),0);
  await page.locator('.spirit-heading-actions .icon-add-button').click();await page.locator('.spirit-editor-name input').fill('打包缩略图验收');
  await page.locator('.spirit-editor-colors input[value="2"]').click();
  await page.locator('.spirit-editor-size-controls input').first().fill('3');await page.locator('.spirit-editor-size-controls input').nth(1).fill('2');
  await page.locator('.spirit-editor-canvas').click({position:{x:10,y:10}});
  await page.locator('.spirit-editor-actions .primary').click();await page.locator('.spirit-editor-dialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('.spirit-thumbnail-card.selected canvas').getAttribute('data-color'),'#ef4444');
  await page.screenshot({path:path.join(data,'精灵库缩略图.png')});
  passed.push('打包版精灵新增及真实颜色缩略图');
  await app.close();app=null;
  await launch();await selectList();
  const reloaded=(await api('listManageableGames')).data;
  assert.equal(reloaded.length,before.length+2);
  for (const id of createdIds) assert.ok(reloaded.some(game=>game.gameId===id));
  const reopenedLife = (await api('getGameEditor', createdIds[0])).data;
  assert.equal(reopenedLife.globalLifeLimit,true);
  assert.equal(reopenedLife.globalLifeLimitValue,20);
  for (const old of before) assert.deepEqual(reloaded.find(game=>game.gameId===old.gameId),old);
  const imported=await page.evaluate(async()=> (await window.mediaLibrary.list()).items);
  assert.equal(imported[0].children.length,2);
  const sprite=await page.evaluate(async()=> (await window.spiritLibrary.list()).data.find(item=>item.name==='打包缩略图验收'));
  assert.equal(sprite.color,2);assert.equal(sprite.width,3);assert.equal(sprite.height,2);
  assert.deepEqual(errors,[]);
  passed.push('真正关闭重启后新游戏、精灵和媒体持久化；旧游戏未变');
  console.log(JSON.stringify({data,passed},null,2));
} catch (error) {
  if(page&&!page.isClosed())await page.screenshot({path:path.join(data,'失败现场.png')});
  console.error(`证据目录：${data}`);throw error;
} finally {
  await app?.close();await writeFile(path.join(data,'验收结果.json'),JSON.stringify({passed,errors},null,2));
}
