// Packaged Electron + embedded backend; all writes go to an isolated userData.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { _electron, expect } = createRequire(path.join(root, '../ledGame-platform/package.json'))('@playwright/test');
await mkdir(path.join(root, '.build'), { recursive: true });
const data = await mkdtemp(path.join(root, '.build/game-catalog-packaged-'));
const file = path.join(data, 'roundtrip.game.json');
async function freePort() { const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r)); return port; }
const port = await freePort(), framePort = await freePort();
const env = { ...process.env, LED_USER_DATA_DIR: data, LED_PORTABLE_BACKEND_PORT: String(port), LED_DEBUG_TCP_PORT: String(framePort),
  LED_ROOM_CONNECTION_ENABLED: 'false', ELC408_ENABLED: 'false', LED_DISABLE_DEVTOOLS: '1' };
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
  document.globalTimeLimit = true; document.globalTimeLimitValue = 120;
  if (family === 'entertainment') {
    document.levels[0].option.rewardPoints = 10;
    document.levels[0].option.passLevelScore = 999;
    document.levels[0].frameList[0].matrix = [{ id: 'blue-target', x: 8, y: 18, color: 1, points: [[0, 0]] }];
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
  let card = page.locator(`.game-card[data-id="${simple}"]`);
  await check('分类内卡片直接调试并返回原分类，无 Touch/DebugPanel 窗口', async () => {
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
    await button('退出调试，返回游戏列表').click();
    await expect(page.locator('.game-category-breadcrumb')).toContainText('维护验收分类'); await expect(card).toBeVisible();
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
    await select('游戏列表'); await card.hover(); await card.getByRole('button', { name: '编辑', exact: true }).click();
    await button('全局配置').click();
    const visibility = page.locator('.global-config-field').filter({ hasText: '触屏显示' }).locator('input'); await visibility.uncheck();
    await page.locator('.global-config-actions .primary').click(); await expect(page.locator('.global-config-dialog')).toHaveCount(0);
    assert.equal((await request(`/game/${simple}`)).data.childModeVisible, false); await button('返回列表').click();
    await expect(card).toBeVisible(); assert.equal(await button('启动游戏').count(), 0);
  });
  await check('Rank 卡片进入同一调试页，编辑器保留触屏显示配置', async () => {
    const rankCard = page.locator(`.game-card[data-id="${rank}"]`); await rankCard.hover(); await rankCard.getByRole('button', { name: '调试游戏', exact: true }).click();
    await button('启动游戏').click(); await expect.poll(async () => (await request('/engine/game/state')).data.engineState).toBe('RUNNING'); await button('退出调试，返回游戏列表').click();
    await rankCard.hover(); await rankCard.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.getByText('触屏显示', { exact: true })).toBeVisible(); assert.equal(await button('启动游戏').count(), 0);
    await page.locator('.rank-title .icon-action').click();
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
