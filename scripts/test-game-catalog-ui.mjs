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
  await check('分类内使用分类名大标题并可新建，取消不创建记录', async () => {
    await page.locator('.game-category-card-main').click();
    await expect(page.locator('.page-heading h1')).toHaveText('验收分类');
    await expect(page.locator('.page-heading p, .game-category-breadcrumb span')).toHaveCount(0);
    await button('新建游戏').click(); await expect(page.locator('.game-creation-dialog')).toBeVisible();
    await button('取消').click(); assert.equal(await page.evaluate(() => window.fixture.games.length), 2);
    await button('返回首页').click();
  });
  await check('导航普通、悬浮与选中均为白字', async () => {
    const nav = page.getByTestId('game-menu-button');
    await expect(nav).toHaveCSS('color', 'rgb(255, 255, 255)'); await nav.hover();
    await expect(nav).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.locator('.nav-tab').filter({ hasText: /^媒体库$/ }).click();
    await expect(nav).toHaveCSS('color', 'rgb(255, 255, 255)'); await select('首页');
  });
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
  await check('卡片靠左换行，按封面比例调整宽度，无黑边且标题独立', async () => {
    await page.evaluate(() => {
      const template = window.fixture.games[0];
      const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      const images = Object.fromEntries([['test-cover.png',600,800], ['test-cover-narrow.png',420,800], ['test-cover-wide.png',800,420]].map(([name,w,h]) => [
        `led-media://preview/${name}`, 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#124e78"/><text x="40" y="220" fill="white" font-size="80">Game</text></svg>`),
      ]));
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { source.set.call(this, images[value] || value); } });
      template.cover = 'test-cover.png';
      for (let id = 20; id < 28; id++) window.fixture.games.push({ ...template, id, name: `布局测试${id}` });
      window.mountComponent('GameListView', { section: 'list' }, { applicationShell: true });
    });
    await expect(page.locator('.game-card')).toHaveCount(10);
    await expect.poll(() => page.locator('.game-card img').first().evaluate(image => image.naturalWidth)).toBe(600);
    for (const width of [1024, 1366, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1080 });
      const layout = await page.locator('.game-card-grid').evaluate(grid => {
        const cards = [...grid.querySelectorAll('.game-card')].map(card => card.getBoundingClientRect());
        return { columns: new Set(cards.map(card => Math.round(card.x))).size, widths: cards.map(card => card.width), gap: getComputedStyle(grid).columnGap, overflow: grid.scrollWidth > grid.clientWidth + 1,
          firstOffset: cards[0].left - grid.getBoundingClientRect().left, width: grid.clientWidth };
      });
      assert.equal(layout.columns, Math.min(10, Math.floor((layout.width - 4 + 36) / (215 + 36))));
      assert.ok(layout.widths.every(value => Math.abs(value - 215) < 0.5)); assert.equal(layout.gap, '36px'); assert.equal(layout.overflow, false);
      assert.ok(layout.firstOffset >= 0 && layout.firstOffset <= 3, 'first card starts at the left padding');
      const sections = await page.locator('.game-card').first().evaluate(card => {
        const box = selector => { const r = card.querySelector(selector).getBoundingClientRect(); return { top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
        return { cover:box('.game-card-cover'), title:box('.game-card-copy'), actions:box('.game-card-actions') };
      });
      assert.ok(Math.abs(sections.cover.width / sections.cover.height - 0.75) < 0.01);
      assert.ok(sections.title.top >= sections.cover.bottom - 1);
      assert.ok(sections.actions.bottom <= sections.cover.bottom + 1);
      await expect(page.locator('.game-card h2').first()).toHaveCSS('font-size', '16px');
      await expect(page.locator('.game-card h2').first()).toHaveCSS('font-weight', '400');
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => {
      for (const [id, cover] of [[20,'test-cover-narrow.png'],[21,'test-cover-wide.png'],[22,'missing-cover.png']]) window.fixture.games.find(game => game.id === id).cover = cover;
      window.mountComponent('GameListView', { section: 'list' }, { applicationShell: true });
    });
    for (const [id, ratio] of [[20,420/800],[21,800/420]]) {
      const card = page.locator(`.game-card[data-id="${id}"]`);
      await expect.poll(() => card.locator('img').evaluate(image => image.naturalWidth / image.naturalHeight)).toBe(ratio);
      const cover = await card.locator('.game-card-cover').boundingBox();
      assert.ok(Math.abs(cover.width / cover.height - ratio) < 0.005, 'container matches natural image ratio without letterboxing');
      assert.ok(Math.abs(cover.height - 284) < 0.5, 'existing cover height stays the same');
      assert.ok(Math.abs((await card.boundingBox()).width - (284 * ratio + 2)) < 0.5);
    }
    await expect(page.locator('.game-card[data-id="22"] .game-card-cover-placeholder')).toBeVisible();
    await expect(page.locator('.game-card[data-id="22"]')).toHaveCSS('width', '215px');
    const changed = page.locator('.game-card[data-id="20"]');
    await page.evaluate(() => { window.getComponentSetup().games.find(game => game.id === 20).cover = 'missing-cover.png'; });
    await expect(changed.locator('.game-card-cover-placeholder')).toBeVisible(); await expect(changed).toHaveCSS('width', '215px');
    await page.evaluate(() => { window.getComponentSetup().games.find(game => game.id === 20).cover = 'test-cover-wide.png'; });
    await expect.poll(() => changed.locator('img').evaluate(image => image.naturalWidth)).toBe(800);
    await expect.poll(() => changed.evaluate(card => Math.abs(card.getBoundingClientRect().width - (284 * 800 / 420 + 2)) < .5)).toBe(true);
    await page.locator('.game-card').first().hover();
    await page.screenshot({ path: path.join(output, '左对齐小卡片.png') });
  });
  await check('符号灯关闭仅隐藏左侧详细配置，矩阵预览保留，重新开启保留草稿', async () => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => window.mountComponent('PixelLightLayoutDialog', {
      layout: { form: { open: 0, topWallPixelLightNum: 1 } }, gridWidth: 16, gridHeight: 36,
    }));
    const dialog = page.getByRole('dialog'), toggle = dialog.locator('.pixel-layout-section-head input[type=checkbox]').first();
    await expect(dialog.locator('.pixel-layout-fields')).toBeHidden(); await expect(dialog.locator('.pixel-layout-wall-counts')).toBeHidden();
    await expect(dialog.locator('.pixel-layout-rows')).toBeHidden(); await expect(dialog.locator('.pixel-layout-preview-section')).toBeVisible();
    await expect(dialog.locator('.pixel-layout-floor-grid line')).toHaveCount(54);
    const disabledSize = await dialog.boundingBox();
    await page.screenshot({ path: path.join(output, '符号灯未启用.png') });
    await expect(button('绘制')).toBeVisible(); await button('绘制').click();
    const close = dialog.locator('.pixel-layout-header button');
    await button('保存').focus(); await page.keyboard.press('Tab'); await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(button('保存')).toBeFocused(); await toggle.check();
    const enabledSize = await dialog.boundingBox();
    assert.equal(enabledSize.width, disabledSize.width); assert.equal(enabledSize.height, disabledSize.height);
    const count = dialog.locator('.pixel-layout-wall-counts input').first(); await count.fill('3'); await count.dispatchEvent('change');
    await toggle.uncheck(); await toggle.check(); await expect(count).toHaveValue('3');
    await expect(dialog).toHaveCSS('background-color', 'rgb(255, 255, 255)'); await expect(dialog.locator('h2')).toHaveCSS('color', 'rgb(17, 17, 17)');
    await toggle.uncheck(); await button('保存').click();
    const saved = await page.evaluate(() => window.componentEvents.find(event => event[0] === 'save')?.[1]);
    assert.equal(saved.form.open, 0); assert.equal(saved.form.topWallPixelLightNum, 3);
    await toggle.check(); await count.fill('4'); await count.dispatchEvent('change'); await button('取消').click();
    assert.equal(await page.evaluate(() => window.componentEvents.filter(event => event[0] === 'save').length), 1);
    await page.evaluate(() => window.mountComponent('GameGlobalConfigDialog', { config: window.fixture.games[0] }));
    await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.locator('.global-config-field').first().getByRole('button', { name: '选择', exact: true }).click();
    const picker = page.locator('.media-picker-dialog'); await expect(picker).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(picker.locator('h2')).toHaveCSS('color', 'rgb(17, 17, 17)');
    await page.screenshot({ path: path.join(output, '白底弹窗.png') });
    await picker.getByRole('button', { name: '取消', exact: true }).click();
    await page.locator('.global-config-dialog').getByRole('button', { name: '取消', exact: true }).click();
  });
  await check('分类、确认、语言、精灵、特效、布线、副屏选择弹窗统一浅色且预览不变色', async () => {
    const variants = [
      ['GameCreationDialog', {}], ['GameCategoryEditDialog', { name: '分类', cover: '' }],
      ['CatalogDeleteDialog', { message: '删除确认' }], ['LanguageSelectionDialog', {}],
      ['SpiritPointEditorDialog', { spirit: { name: '精灵', width: 2, height: 2, color: 2, points: '[[0,0]]' } }],
      ['GameEffectDialog', {}], ['GameWiringDialog', { width: 16, height: 36 }],
      ['SecondaryDisplayPickerDialog', { open: true }],
    ];
    for (const [component, props] of variants) {
      await page.evaluate(([name, props]) => window.mountComponent(name, props), [component, props]);
      const modal = page.getByRole('dialog'); await expect(modal).toBeVisible();
      await expect(modal).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(modal).toHaveCSS('color', 'rgb(17, 17, 17)');
      const control = modal.locator('button:visible, input:visible, select:visible').first();
      await expect(control).toHaveCSS('color', 'rgb(17, 17, 17)');
      if (component === 'GameEffectDialog') await expect(modal.locator('.game-effect-color-swatch').first()).toHaveCSS('background-color', 'rgb(0, 255, 0)');
    }
  });
  await check('Touch 的排队、返回待机与退出密码弹窗也使用白底黑字', async () => {
    await page.evaluate(() => window.mountComponent('LedGameTouchView'));
    await expect(page.locator('.touch-shell')).toBeVisible();
    for (const flag of ['queuePanelOpen', 'returnIdleDialogOpen', 'exitKeypadOpen']) {
      await page.evaluate(flag => { window.getComponentSetup()[flag] = true; }, flag);
      const modal = page.getByRole('dialog'); await expect(modal).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(modal).toHaveCSS('color', 'rgb(17, 17, 17)');
      await expect(modal.locator('button').first()).toHaveCSS('color', 'rgb(17, 17, 17)');
      await page.evaluate(flag => { window.getComponentSetup()[flag] = false; }, flag);
    }
  });
  assert.deepEqual(errors, []);
} catch (error) { await page.screenshot({ path: path.join(output, '失败.png') }); throw error; }
finally { await writeFile(path.join(output, '验证记录.json'), JSON.stringify({ passed, errors }, null, 2)); await browser.close(); await server.close(); }
