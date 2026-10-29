// Packaged Electron + embedded backend; all writes go to an isolated userData.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { _electron, expect } = createRequire(path.join(root, '../ledGame-platform/package.json'))('@playwright/test');
await mkdir(path.join(root, '.build'), { recursive: true });
const data = await mkdtemp(path.join(root, '.build/game-catalog-packaged-'));
const media = path.join(data, 'media'); await mkdir(media);
await copyFile(path.join(root,'build-resources/media/危险来袭.mp3'),path.join(media,'危险来袭.mp3'));
const file = path.join(data, 'roundtrip.game.json');
async function freePort() { const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r)); return port; }
const port = await freePort(), framePort = await freePort();
const env = { ...process.env, LED_USER_DATA_DIR: data, LED_PORTABLE_BACKEND_PORT: String(port), LED_DEBUG_TCP_PORT: String(framePort),
  LED_ROOM_CONNECTION_ENABLED: 'false', ELC408_ENABLED: 'false', LED_DISABLE_DEVTOOLS: '1', LED_MEDIA_DIR: media };
delete env.ELECTRON_RUN_AS_NODE;
let app, page, importedId; const passed = [], errors = [];
const request = async (route, method = 'GET', body, ok = true) => {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(response.ok, ok, await response.clone().text()); return response.json();
};
const api = (method, ...args) => page.evaluate(([method, args]) => window.ledGame[method](...args), [method, args]);
const button = name => page.getByRole('button', { name, exact: true });
const select = async name => { await page.getByTestId('game-menu-button').click(); await page.getByRole('menuitem', { name, exact: true }).click(); };
async function launch() {
  app = await _electron.launch({ executablePath: path.join(root, 'release/win-unpacked/LED Game.exe'), env, timeout: 90000 });
  await expect.poll(() => { page = app.windows().find(w => w.url().includes('/dist/index.html') && !w.url().includes('window=')); return Boolean(page); }, { timeout: 90000 }).toBe(true);
  page.on('pageerror', error => errors.push(error.message)); await page.getByTestId('game-menu-button').waitFor();
  await page.bringToFront(); await page.setViewportSize({ width: 1366, height: 768 });
}
async function check(name, fn) { await fn(); passed.push(name); console.log('通过：' + name); }
async function create(family, name) {
  const document = (await request('/games/draft', 'POST', { family })).data;
  document.name = name; if (family === 'ranked') document.displayName = name;
  document.childModeVisible = false;
  if(family==='ranked')Object.assign(document.levels[0],{type:2,bombWarningAudio:'危险来袭.mp3',bombExplosionAudio:'Ranking/bomb.mp3'});
  document.globalTimeLimit = true; document.globalTimeLimitValue = 120;
  if (family === 'entertainment') {
    document.cover = 'cover.png';
    document.audio = {...document.audio,scoreSound:'score.mp3',injurySound:'injury.mp3',purpleSound:'double.mp3'};
    document.commonConfig = {...document.commonConfig,gameStartAudio:'start.mp3',gameEndSuccessAudio:'success.mp3',gameEndFailAudio:'fail.mp3',levelPassAudio:'pass.mp3',levelRestartAudio:'restart.mp3'};
    document.gif = {...document.gif,standby:'idle.gif',gameFailure:'fail.gif',gameOver:'over.gif'};
    document.levels[0].option.rewardPoints = 10;
    document.levels[0].option.passLevelScore = 999;
    document.levels[0].option.lifeLimitMode = 'LIMITED'; document.levels[0].option.lifeLimitValue = 5;
    document.levels[0].frameList[0].matrix = [{ id: 'blue-target', x: 8, y: 18, color: 1, points: [[0, 0], [1, 0]] }, { id: 'red-hazard', x: 10, y: 18, color: 2, points: [[0, 0]] }];
    document.levels.push({ ...structuredClone(document.levels[0]), label: '第二关' });
  }
  const saved = (await request(family === 'ranked' ? '/rank-game-editor' : '/game-editor', 'POST', document)).data;
  assert.equal((await request(`/game/${saved.gameId}`)).data.childModeVisible, false);
  await request(`/games/${saved.gameId}/metadata`, 'PATCH', { childModeVisible: true });
  return saved.gameId;
}
try {
  await launch();
  const simple = await create('entertainment', '维护验收-Normal'), rank = await create('ranked', '维护验收-Rank');
  const category = (await request('/game-categories', 'POST', { name: '维护验收分类' })).data;
  await request(`/games/${simple}/metadata`, 'PATCH', { firstCatalog: String(category.id) });
  // Refresh the kept catalog by changing application pages before using the cards.
  await page.locator('.nav-tab').filter({ hasText: /^媒体库$/ }).click(); await select('首页');
  await page.locator(`.game-category-card[data-id="${category.id}"] .game-category-card-main`).click();
  // Fixtures are written through REST, outside the renderer's catalog-change IPC.
  // If its initial read predated those writes, use the existing explicit refresh.
  if (await button('重新加载').isVisible()) await button('重新加载').click();
  let card = page.locator(`.game-card[data-id="${simple}"]`);
  await expect.poll(async()=>{
    if(await card.count())return true;
    if(await button('重新加载').isVisible())await button('重新加载').click();
    return false;
  },{timeout:15000}).toBe(true);
  await check('分类标题、新建弹窗白底黑字及导航白字', async () => {
    await expect(page.locator('.page-heading h1')).toHaveText('维护验收分类');
    await expect(page.locator('.page-heading p, .game-category-breadcrumb span')).toHaveCount(0);
    await expect(button('导入游戏')).toBeVisible();
    await expect(page.getByTestId('game-menu-button')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await button('新建游戏').click();
    await expect(page.locator('.game-creation-dialog')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('.game-creation-dialog')).toHaveCSS('color', 'rgb(17, 17, 17)');
    await button('取消').click(); await expect(card).toBeVisible();
    await expect(card.locator('h2')).toHaveCSS('font-size', '16px');
    await expect(card.locator('h2')).toHaveCSS('font-weight', '400');
    await expect(card).toHaveCSS('width', '215px');
    assert.ok(await card.evaluate(card => {
      const cover = card.querySelector('.game-card-cover').getBoundingClientRect();
      const copy = card.querySelector('.game-card-copy').getBoundingClientRect();
      const actions = card.querySelector('.game-card-actions').getBoundingClientRect();
      const grid = card.parentElement.getBoundingClientRect();
      return card.getBoundingClientRect().left - grid.left <= 3 && copy.top >= cover.bottom - 1 && actions.bottom <= cover.bottom + 1;
    }), 'packaged card is left-aligned with a separate cover and title');
  });
  await check('分类内卡片调试、运行和暂停切关重置本局并返回原分类', async () => {
    await card.hover(); await card.getByRole('button', { name: '调试游戏', exact: true }).click();
    await expect(page.locator('.editor-debug-workspace')).toBeVisible();
    assert.equal(await page.locator('.simple-editor-fit-viewport').count(), 0);
    assert.equal(app.windows().filter(w => /window=(debug|touch)/.test(w.url())).length, 0);
    await button('启动游戏').click(); await expect.poll(async () => (await request('/engine/game/state')).data.engineState).toBe('RUNNING');
    assert.equal((await request('/engine/game/state')).data.gameId, simple);
    assert.equal((await request('/engine/game/state')).data.engineState, 'RUNNING');
    await request(`/game/${simple}`, 'DELETE', undefined, false);
    await button('暂停').click(); await expect.poll(async () => (await request('/engine/game/state')).data.engineState).toBe('PAUSED');
    await request(`/game/${simple}`, 'DELETE', undefined, false);
    await button('继续').click(); await page.locator('.editor-debug-workspace canvas').click({ position: { x: 20, y: 20 } });
    const initial = (await request('/engine/game/state')).data;
    await api('sendDebugCommand', { command: 'tileinput', sessionId: initial.sessionId, x: 8, y: 18 });
    await api('sendDebugCommand', { command: 'tileinput', sessionId: initial.sessionId, x: 10, y: 18 });
    await expect.poll(async () => { const state = (await request('/engine/game/state')).data; return [state.gameplay.score, state.gameplay.life]; }).toEqual([1, 4]);
    await button('暂停').click(); await page.locator('[data-debug-field=startLevel]').fill('2'); await button('切换关卡').click();
    await expect.poll(async () => { const state = (await request('/engine/game/state')).data; return state.engineState === 'RUNNING' ? state.currentStageIndex : null; }).toBe(1);
    const switched = (await request('/engine/game/state')).data;
    assert.notEqual(switched.sessionId, initial.sessionId); assert.equal(switched.gameplay.score, 0); assert.equal(switched.gameplay.life, 5);
    assert.ok(switched.gameplay.globalElapsedTime < 3000); assert.ok(switched.gameTime.remainingMillis > 110000);
    await page.locator('[data-debug-field=startLevel]').fill('1'); await button('切换关卡').click();
    await expect.poll(async () => { const state = (await request('/engine/game/state')).data; return state.engineState === 'RUNNING' ? state.currentStageIndex : null; }).toBe(0);
    await button('退出调试，返回游戏列表').click();
    await expect(page.locator('.page-heading h1')).toHaveText('维护验收分类'); await expect(card).toBeVisible();
  });
  await check('真实PNG封面按自身比例收窄卡片，无容器黑边且不裁切', async () => {
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 800;
      const context = canvas.getContext('2d'); context.fillStyle = '#124e78'; context.fillRect(0, 0, 420, 800);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await writeFile(path.join(media, 'cover.png'), Buffer.from(png, 'base64'));
    await request(`/games/${simple}/metadata`, 'PATCH', { cover: 'cover.png' });
    await button('返回首页').click(); await page.locator('.nav-tab').filter({ hasText: /^媒体库$/ }).click(); await select('首页');
    await page.locator(`.game-category-card[data-id="${category.id}"] .game-category-card-main`).click();
    await expect.poll(() => card.locator('img').evaluate(image => image.naturalWidth)).toBe(420);
    await expect.poll(() => card.locator('.game-card-cover').evaluate(element => Math.abs(element.getBoundingClientRect().height - 284) < 1)).toBe(true);
    const cover = await card.locator('.game-card-cover').boundingBox();
    assert.ok(Math.abs(cover.width / cover.height - 420 / 800) < .005);
    // Windows display scaling can quantize a 1px border to 0.8 CSS px.
    assert.ok(Math.abs(cover.height - 284) < 1, JSON.stringify(cover)); assert.ok(Math.abs((await card.boundingBox()).width - 151.1) < .5);
  });
  await check('完整游戏导出、取消、按类型导入与同名新增，保留原记录', async () => {
    const original = (await request(`/game/${simple}`)).data;
    await app.evaluate(({ dialog }, file) => {
      globalThis.originalSaveDialog = dialog.showSaveDialog; globalThis.originalOpenDialog = dialog.showOpenDialog;
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await card.hover(); await card.getByRole('button', { name: '导出', exact: true }).click();
    await expect.poll(() => readFile(file, 'utf8').then(() => true).catch(() => false)).toBe(true);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), original);
    await select('游戏列表'); const before = (await request('/game')).data.length;
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
    await button('导入游戏').click(); await page.locator('.game-creation-dialog footer .primary').click();
    await expect(page.locator('.game-creation-dialog')).toHaveCount(0); assert.equal((await request('/game')).data.length, before);
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
    await button('导入游戏').click(); await page.locator('.game-creation-dialog').getByRole('button', { name: /排位赛/ }).click();
    await page.locator('.game-creation-dialog footer .primary').click(); await expect(page.getByRole('alert')).toContainText('不匹配');
    assert.equal((await request('/game')).data.length, before);
    await page.locator('.game-creation-dialog').getByRole('button', { name: /娱乐挑战/ }).click(); await page.locator('.game-creation-dialog footer .primary').click();
    await expect(page.locator('.game-creation-dialog')).toHaveCount(0);
    const imported = (await request('/game')).data.find(g => g.name === '维护验收-Normal（导入）');
    importedId = imported?.id;
    assert.ok(imported && imported.id !== simple); assert.equal(imported.firstCatalog, '');
    for (const field of ['id', 'name', 'remark', 'firstCatalog', 'displayOrder', 'createTime', 'updateTime']) delete original[field];
    const comparable = { ...imported }; for (const field of ['id', 'name', 'remark', 'firstCatalog', 'displayOrder', 'createTime', 'updateTime']) delete comparable[field];
    assert.deepEqual(comparable, original);
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = globalThis.originalSaveDialog; dialog.showOpenDialog = globalThis.originalOpenDialog; });
  });
  await check('导入后立即关闭重启，新增记录及全部关卡配置仍在', async () => {
    await app.close(); app = null; await launch(); await select('游戏列表');
    card = page.locator(`.game-card[data-id="${simple}"]`);
    await expect(page.locator(`.game-card[data-id="${importedId}"]`)).toBeVisible();
    const imported = (await request(`/game/${importedId}`)).data;
    assert.equal(imported.firstCatalog, ''); assert.equal(JSON.parse(imported.levels)[0].option.rewardPoints, 10);
  });
  await check('分类删除保留游戏，取消不写入，重试与卡片焦点正常', async () => {
    await select('首页'); const categoryCard = page.locator(`.game-category-card[data-id="${category.id}"]`); await categoryCard.hover();
    await categoryCard.getByRole('button', { name: '删除', exact: true }).click(); await button('取消').click();
    assert.ok((await request('/game-categories')).data.some(c => c.id === category.id));
    await categoryCard.getByRole('button', { name: '删除', exact: true }).click(); await page.locator('.catalog-confirm-dialog').getByRole('button', { name: '删除', exact: true }).click();
    await expect(categoryCard).toHaveCount(0); assert.equal((await request(`/game/${simple}`)).data.firstCatalog, '');
    const replacement = (await request('/game-categories', 'POST', { name: '保存验收分类' })).data;
    await select('游戏列表'); await card.hover(); await card.getByRole('button', { name: '编辑', exact: true }).click();
    await page.locator('.simple-editor-fit-shell.ready').waitFor();
    await button('显示对象列表').click(); await expect(page.locator('.object-row')).toHaveCount(2);
    await page.locator('[data-tool=eraser]').click();
    const board = await page.locator('.matrix-base-canvas').boundingBox();
    await page.mouse.click(board.x + board.width * 8.5 / 16, board.y + board.height * 18.5 / 36);
    await expect(page.locator('.object-row')).toHaveCount(1);
    await button('撤销 RGB 编辑').click(); await expect(page.locator('.object-row')).toHaveCount(2);
    await button('重做 RGB 编辑').click(); await expect(page.locator('.object-row')).toHaveCount(1);
    await button('撤销 RGB 编辑').click(); await expect(page.locator('.object-row')).toHaveCount(2);
    await expect(page.locator('.level-tab-delete')).toHaveCount(2);
    await button('全局配置').click();
    await page.locator('.global-config-field').filter({ has: page.locator('.global-config-label').filter({ hasText: /^一级菜单$/ }) }).locator('select').selectOption(String(replacement.id));
    const visibility = page.locator('.global-config-field').filter({ hasText: '触屏显示' }).locator('input'); await visibility.uncheck();
    await page.locator('.global-config-actions .primary').click(); await expect(page.locator('.global-config-dialog')).toHaveCount(0);
    await page.locator('.editor-save-dialog button').click();
    assert.equal((await request(`/game/${simple}`)).data.childModeVisible, false);
    const rewardInput = page.locator('.editor-left input').first();
    const savedReward = await rewardInput.inputValue();
    await rewardInput.fill(''); await button('保存').click();
    await expect(page.locator('.editor-save-dialog')).toContainText('请填写以下必填项');
    assert.equal(JSON.parse((await request(`/game/${simple}`)).data.levels)[0].option.rewardPoints, Number(savedReward));
    await page.locator('.editor-save-dialog button').click();
    await rewardInput.fill(savedReward); await button('保存').click();
    await expect(page.locator('.editor-save-dialog h2')).toHaveText('保存成功');
    await page.locator('.editor-save-dialog button').click();
    await button('符号灯布局').click();
    await expect(page.locator('.pixel-layout-fields')).toBeHidden(); await expect(page.locator('.pixel-layout-preview-section')).toBeVisible();
    await expect(page.locator('.pixel-layout-floor-grid line')).toHaveCount(54);
    await expect(page.locator('.pixel-layout-dialog')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.locator('.pixel-layout-dialog').getByRole('button', { name: '取消', exact: true }).click(); await button('返回列表').click();
    await expect(card).toBeVisible(); assert.equal(await button('启动游戏').count(), 0);
  });
  await check('Rank 卡片进入同一调试页，编辑器保留触屏显示配置', async () => {
    const rankCard = page.locator(`.game-card[data-id="${rank}"]`); await rankCard.hover(); await rankCard.getByRole('button', { name: '调试游戏', exact: true }).click();
    await button('启动游戏').click(); await expect.poll(async () => (await request('/engine/game/state')).data.engineState).toBe('RUNNING'); await button('退出调试，返回游戏列表').click();
    await rankCard.hover(); await rankCard.getByRole('button', { name: '编辑', exact: true }).click();
    await button('全局配置').click();await expect(page.locator('.global-config-dialog').getByText('触屏显示', { exact: true })).toBeVisible();assert.equal(await button('启动游戏').count(), 0);
    const rankName=page.locator('.global-config-field').filter({has:page.locator('.global-config-label').filter({hasText:/^名称$/})}).locator('input');
    const originalName=await rankName.inputValue();await rankName.fill('');await page.locator('.global-config-actions .primary').click();
    await expect(page.locator('.editor-save-dialog')).toContainText('请填写以下必填项');
    assert.equal((await request(`/game/${rank}`)).data.name, originalName);
    await page.locator('.editor-save-dialog button').click();
    await rankName.fill(originalName);await page.locator('.global-config-actions .primary').click();
    await expect(page.locator('.editor-save-dialog h2')).toHaveText('保存成功');
    await page.locator('.editor-save-dialog button').click();
    await button('添加关卡').click();await page.locator('[data-rank-field="level.type"]').selectOption('3');
    await page.locator('[data-rank-field="level.bounds.x"]').fill('2,15'); await page.locator('[data-rank-field="level.bounds.y"]').fill('3,34');
    await page.locator('[data-rank-field="level.label"]').fill('第二关验收');await page.locator('[data-rank-field="level.durationSeconds"]').fill('1');await page.locator('[data-rank-field="level.rewardPoints"]').fill('11');
    const explosion=page.locator('[data-rank-field="level.bombExplosionAudio"]');
    await explosion.getByRole('button',{name:'选择',exact:true}).click();
    await page.locator('.media-picker-row[data-path="危险来袭.mp3"]').click();await page.locator('.media-picker-actions .primary').click();
    await page.locator('.rank-actions .primary').click();await expect(page.locator('.editor-save-dialog h2')).toHaveText('保存成功');await page.locator('.editor-save-dialog button').click();
    const persisted=(await request(`/rank-game-editor/${rank}`)).data;assert.equal(persisted.levels.length,2);assert.equal(persisted.levels[1].label,'第二关验收');assert.equal(persisted.levels[1].rewardPoints,11);assert.deepEqual(persisted.levels[1].bounds,{minX:1,maxX:14,minY:2,maxY:33});
    assert.deepEqual(persisted.levels.map(level=>level.type),[2,3]);
    assert.equal(persisted.levels[0].bombWarningAudio,'危险来袭.mp3');assert.equal(persisted.levels[0].bombExplosionAudio,'Ranking/bomb.mp3');assert.equal(persisted.levels[1].bombExplosionAudio,'危险来袭.mp3');
    await button('返回列表').click();
    await rankCard.getByRole('button',{name:'调试游戏',exact:true}).focus();await rankCard.getByRole('button',{name:'调试游戏',exact:true}).click();
    await page.locator('.editor-debug-workspace input[type=number]').nth(1).fill('2');await button('启动游戏').click();
    await expect.poll(async()=>{const state=(await request('/engine/game/state')).data;return state.engineState==='RUNNING'?state.currentStageIndex:null;}).toBe(1);
    await expect.poll(async()=>(await request('/engine/game/state')).data.engineState,{timeout:15000}).toBe('STOPPED');
    assert.equal((await request('/engine/game/state')).data.success,true);
    await button('退出调试，返回游戏列表').click();
  });
  await check('删除游戏取消保留、确认删除，删空后刷新与重启不补回', async () => {
    await card.hover(); await card.getByRole('button', { name: '删除', exact: true }).click(); await button('取消').click();
    assert.ok((await request(`/game/${simple}`)).data);
    await card.getByRole('button', { name: '删除', exact: true }).click(); await page.locator('.catalog-confirm-dialog').getByRole('button', { name: '删除', exact: true }).click();
    await expect(card).toHaveCount(0);
    for (const game of (await request('/game')).data) await request(`/game/${game.id}`, 'DELETE');
    await page.locator('.nav-tab').filter({ hasText: /^媒体库$/ }).click(); await select('游戏列表'); await expect(page.locator('.game-card')).toHaveCount(0);
    assert.equal((await request('/game')).data.length, 0);
    await app.close(); app = null; await launch(); await select('游戏列表');
    await expect(page.locator('.game-card')).toHaveCount(0); assert.equal((await request('/game')).data.length, 0);
    await expect(button('导入游戏')).toBeVisible(); await expect(button('新建游戏')).toBeVisible();
  });
  await page.screenshot({ path: path.join(data, '删空重启.png') }); assert.deepEqual(errors, []);
  console.log('隔离验收目录：' + data);
} catch (error) { if (page && !page.isClosed()) await page.screenshot({ path: path.join(data, '失败.png') }); console.error('隔离验收目录：' + data); throw error; }
finally { await app?.close(); await writeFile(path.join(data, '验证记录.json'), JSON.stringify({ passed, errors }, null, 2)); }
