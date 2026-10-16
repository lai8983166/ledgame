import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium, expect } = createRequire(path.join(root, '../ledGame-platform/package.json'))('@playwright/test');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(n => /^chromium-\d+$/.test(n)).sort().at(-1);
const output = path.join(root, '.build/game-catalog-ui'); await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [], passed = []; page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const make = (id, type) => ({ id, gameId: id, type, name: type === 'rank' ? 'Rank测试' : 'Normal测试', mode: '[1]', firstCatalog: '1',
    siteSizeWidth: 16, siteSizeHeight: 36, participants: 2, minPlayers: 1, maxPlayers: 2, childModeVisible: true,
    color0: '#00ff00', color1: '#0000ff', color2: '#ff0000', color3: '#aa00ff',
    commonConfig: {}, wiringData: { width: 16, height: 36, runtimeEnabled: false, lines: [] },
    palette: ['#ff0000', '#0000ff', '#00ff00', '#ffff00', '#aa00ff', '#00ffff'],
    levels: type === 'rank' ? [{ type: 1, label: 'Rank', durationSeconds: 60, bounds: { minX: 0, maxX: 15, minY: 0, maxY: 35 } }]
      : [{ label: '关卡 1', option: { passLevelScore: 1, rewardPoints: 10, timeLimitMode: 'UNLIMITED', lifeLimitMode: 'UNLIMITED' }, frameList: [{ repeatTimes: 10, matrix: [] }] }],
  });
  const games = [make(1, 'default'), make(2, 'rank')], categories = [{ id: 1, name: '验收分类', displayOrder: 0 }];
  let state = { engineState: 'IDLE', queueSummary: { waiting: [] } }, listeners = [], frames = [], seq = 0;
  const ret = () => ({ data: structuredClone(state) });
  window.fixture = { requests: [], failDelete: false, importCancel: false, importError: false, failStop: false, games, categories,
    listeners: () => [listeners.length, frames.length] };
  const f = window.fixture;
  window.appLanguage = { get: async () => 'zh-CN', onChanged: () => () => {}, set: async v => v };
  window.ledGame = {
    state: async () => ret(), gameState: async () => ret(), customTitleBarEnabled: true,
    listManageableGames: async () => ({ data: structuredClone(games) }), listGameCategories: async () => ({ data: structuredClone(categories) }),
    getGameEditor: async id => ({ data: structuredClone(games.find(g => g.id === id)) }),
    getRankGameEditor: async id => ({ data: structuredClone(games.find(g => g.id === id)) }),
    onEngineState: fn => { listeners.push(fn); return () => listeners = listeners.filter(x => x !== fn); },
    onLedFrame: fn => { frames.push(fn); return () => frames = frames.filter(x => x !== fn); },
    prepareEditorDebugHardware: async () => { f.requests.push(['hardware']); throw Error('ELC408_NO_CONTROLLERS: SEARCH_NO_CONTROLLERS'); },
    deleteGameCategory: async id => { f.requests.push(['delete-category', id]); if (f.failDelete) throw Error('删除失败'); categories.splice(0, 1); games.forEach(g => g.firstCatalog = ''); },
    deleteGame: async id => { f.requests.push(['delete-game', id]); if (f.failDelete) throw Error('删除失败'); games.splice(games.findIndex(g => g.id === id), 1); },
    exportGame: async id => { f.requests.push(['export', id]); return { canceled: true }; },
    importGame: async family => { f.requests.push(['import', family]); if (f.importError) throw Error('类型不匹配'); if (f.importCancel) return { canceled: true }; const game = make(9, family === 'ranked' ? 'rank' : 'default'); games.push(game); return { game, canceled: false }; },
    createEditorPreparation: async options => { f.requests.push(['prepare', structuredClone(options)]); state = { engineState: 'PREPARING', sessionId: 'test-' + ++seq, preparation: { sessionId: 'test-' + seq, options }, queueSummary: { waiting: [] } }; return ret(); },
    updatePreparation: async (id, patch) => { state.playerAccesses = patch.tokenList.map(uid => ({ member: { id: Number(uid), name: '测试会员' }, access: { uid, remainingSeconds: 3600 } })); return ret(); },
    confirmPreparation: async () => { state = { ...state, preparation: null, engineState: 'RUNNING', gameTime: { mode: 'LIMITED', remainingMillis: 60000 }, gameplay: { score: 2, life: 3, memberPoints: 10 } }; return ret(); },
    cancelPreparation: async () => { state = { engineState: 'IDLE', queueSummary: { waiting: [] } }; return ret(); },
    sendDebugCommand: async command => { f.requests.push(['command', structuredClone(command)]); if (command.command === 'endgame') { if (f.failStop) throw Error('停止失败'); state = { engineState: 'STOPPED', queueSummary: { waiting: [] } }; } else if (command.command === 'pause') state.engineState = 'PAUSED'; else if (command.command === 'resume') state.engineState = 'RUNNING'; return ret(); },
  };
  window.mediaLibrary = { list: async () => ({ items: [] }) };
  window.spiritLibrary = { list: async () => ({ data: [] }) };
});
const button = name => page.getByRole('button', { name, exact: true });
const select = async name => { await page.getByTestId('game-menu-button').click(); await page.getByRole('menuitem', { name, exact: true }).click(); };
async function check(name, fn) { await fn(); passed.push(name); console.log('通过：' + name); }
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(() => window.mountComponent); await page.evaluate(() => window.mountComponent('App'));
  await check('分类删除取消、失败重试与保留游戏', async () => {
    await page.locator('.game-category-card').hover(); await page.locator('.game-category-card-delete').click();
    await button('取消').click(); assert.equal(await page.evaluate(() => window.fixture.requests.length), 0);
    await page.locator('.game-category-card-delete').click(); await page.evaluate(() => window.fixture.failDelete = true);
    await page.locator('.catalog-confirm-dialog').getByRole('button', { name: '删除', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('删除失败');
    await page.evaluate(() => window.fixture.failDelete = false); await page.locator('.catalog-confirm-dialog').getByRole('button', { name: '删除', exact: true }).click();
    await expect(page.locator('.game-category-card')).toHaveCount(0); assert.equal(await page.evaluate(() => window.fixture.games.length), 2);
    assert.deepEqual(await page.evaluate(() => window.fixture.games.map(g => g.firstCatalog)), ['', '']);
  });
  await select('游戏列表'); const card = page.locator('.game-card[data-id="1"]');
  await check('卡片悬浮、键盘聚焦及取消导出不误进编辑器', async () => {
    await card.hover(); await expect(card.locator('.game-card-actions')).toHaveCSS('opacity', '1');
    assert.equal(await card.locator('.game-card-edit').count(), 0);
    await card.getByRole('button', { name: '导出', exact: true }).click();
    assert.equal(await page.locator('.simple-editor-fit-viewport').count(), 0);
    await card.getByRole('button', { name: '编辑', exact: true }).focus();
    await expect(card.locator('.game-card-actions')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: path.join(output, '卡片悬浮.png') });
  });
  await check('导入先选类型、取消不生成、错误可重试', async () => {
    await button('导入游戏').click(); assert.equal(await page.getByRole('button', { name: /多维竞技/ }).isDisabled(), true);
    await page.evaluate(() => window.fixture.importCancel = true); await page.locator('.game-creation-dialog footer .primary').click();
    await expect(page.locator('.game-creation-dialog')).toHaveCount(0); await expect(page.locator('.game-card')).toHaveCount(2);
    await button('导入游戏').click(); await page.evaluate(() => { window.fixture.importCancel = false; window.fixture.importError = true; });
    await page.locator('.game-creation-dialog footer .primary').click(); await expect(page.getByRole('alert')).toContainText('类型不匹配');
    await page.evaluate(() => window.fixture.importError = false); await page.locator('.game-creation-dialog footer .primary').click();
    await expect(page.locator('.game-card')).toHaveCount(3);
  });
  await check('卡片直接调试、自动关闭未连接设备提示、键盘人数可输入', async () => {
    const before = await page.evaluate(() => window.fixture.listeners());
    await card.hover(); await card.getByRole('button', { name: '调试游戏', exact: true }).click();
    await expect(page.locator('.editor-debug-workspace')).toBeVisible(); await expect(page.locator('.simple-editor-fit-viewport')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toContainText('未连接设备'); await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 4000 });
    await page.locator('input[type=number]').first().fill('2'); assert.equal(await page.locator('input[type=number]').first().inputValue(), '2');
    await button('启动游戏').click(); await button('暂停').click(); await button('继续').click();
    await page.locator('.editor-debug-workspace canvas').click({ position: { x: 20, y: 20 } });
    await button('重新开始').click();
    await page.evaluate(() => window.fixture.failStop = true); await button('退出调试，返回游戏列表').click(); await expect(page.getByRole('alert')).toContainText('停止失败');
    await page.evaluate(() => window.fixture.failStop = false); await button('退出调试，返回游戏列表').click();
    await expect(page.locator('.game-card')).toHaveCount(3); assert.deepEqual(await page.evaluate(() => window.fixture.listeners()), before);
    assert.ok(await page.evaluate(() => window.fixture.requests.some(r => r[0] === 'command' && r[1].command === 'tileinput')));
  });
  await check('Rank 播放同用调试页，多人真实编号扫码接口可用，导航离开清理', async () => {
    const rank = page.locator('.game-card[data-id="2"]'); await rank.hover(); await rank.getByRole('button', { name: '调试游戏', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 4000 });
    await page.locator('select').first().selectOption('wristband'); await page.locator('input[type=number]').first().fill('2');
    await button('启动游戏').click(); await page.keyboard.type('2283055618'); await page.keyboard.press('Enter');
    await button('启动游戏').click(); await page.keyboard.type('2283055619'); await page.keyboard.press('Enter');
    await button('启动游戏').click(); await button('暂停').click();
    await page.getByTestId('language-menu-button').click(); await page.locator('.language-dialog').waitFor(); await button('取消').click();
    await expect(button('继续')).toBeVisible();
    await page.locator('.nav-tab').filter({ hasText: /^媒体库$/ }).click(); await expect(page.locator('.editor-debug-workspace')).toHaveCount(0);
    await select('游戏列表'); await expect(page.locator('.game-card')).toHaveCount(3);
  });
  await check('编辑进入编辑器不启动游戏，删除取消后仍可选择输入', async () => {
    await card.hover(); await card.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.locator('.simple-editor-fit-viewport')).toBeVisible(); assert.equal(await button('启动游戏').count(), 0);
    await button('全局配置').click(); await expect(page.getByText('触屏显示', { exact: true })).toBeVisible(); await button('取消').click();
    await button('返回列表').click(); await card.hover(); await card.getByRole('button', { name: '删除', exact: true }).click();
    await button('取消').click(); await expect(card).toBeVisible();
    await card.getByRole('button', { name: '删除', exact: true }).click(); await page.locator('.catalog-confirm-dialog').getByRole('button', { name: '删除', exact: true }).click();
    await expect(page.locator('.game-card[data-id="1"]')).toHaveCount(0);
  });
  assert.deepEqual(errors, []);
} catch (error) { await page.screenshot({ path: path.join(output, '失败.png') }); throw error; }
finally { await writeFile(path.join(output, '验证记录.json'), JSON.stringify({ passed, errors }, null, 2)); await browser.close(); await server.close(); }
