// Real Vue/browser regression with in-memory IPC fixtures; no daily database is opened.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, '../ledGame-platform/package.json'))('playwright');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/editor-feedback-defaults-ui');
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { middlewareMode: true, hmr: false } });
const { createServer: createHttpServer } = await import('node:http');
const http = createHttpServer(server.middlewares);
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const passed = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const makeDraft = (rank = false) => ({
    id: null, name: 'Draft', displayName: 'Draft', type: rank ? 'rank' : 'default', mode: '[1]',
    siteSizeWidth: 16, siteSizeHeight: 20, cover: 'cover.png', firstCatalog: '娱乐挑战',
    audio: { scoreSound: 'score.mp3', injurySound: 'injury.mp3', purpleSound: 'double.mp3' },
    gif: { standby: 'idle.gif', gameFailure: 'fail.gif', gameOver: 'over.gif' },
    commonConfig: { gameStartAudio: 'start.mp3', gameEndSuccessAudio: 'win.mp3', gameEndFailAudio: 'fail.mp3', levelPassAudio: 'pass.mp3', levelRestartAudio: 'restart.mp3' },
    levels: rank ? [{ type: 1, durationSeconds: 60, bounds: { minX: 0, maxX: 15, minY: 0, maxY: 19 }, targetsPerPlayerMin: 1, targetsPerPlayerMax: 2, bombMin: 0, bombMax: 1 }]
      : [{ label: 'A', option: { timeLimitMode: 'UNLIMITED', lifeLimitMode: 'UNLIMITED', rewardPoints: 0 }, frameList: [{ repeatTimes: 7, matrix: [] }, { repeatTimes: 3, matrix: [] }] }],
  });
  const simple = { ...makeDraft(), id: 1 }, rank = { ...makeDraft(true), id: 2 };
  window.fixture = { simple, rank, reads: [], writes: [], makeDraft };
  window.appLanguage = { get: async () => 'zh-CN', onChanged: () => () => {} };
  window.ledGame = {
    getGameEditor: async id => { window.fixture.reads.push(id); return { data: structuredClone(simple) }; },
    getRankGameEditor: async id => { window.fixture.reads.push(id); return { data: structuredClone(rank) }; },
    newGameDraft: async family => ({ data: { ...makeDraft(family === 'ranked'), mode: window.fixture.draftMode || '[1]' } }),
    listGameCategories: async () => ({ data: [{ id: 1, name: '娱乐挑战', code: '娱乐挑战' }] }),
    seedSimpleVariants: async () => {}, seedRankType1: async () => {},
    listManageableGames: async () => ({ data: [simple, rank] }),
    createGameEditor: async payload => { window.fixture.writes.push(payload); return { data: { saved: true, gameId: 3 } }; },
    createRankGameEditor: async payload => { window.fixture.writes.push(payload); return { data: { saved: true, gameId: 4 } }; },
  };
  window.spiritLibrary = { list: async () => ({ data: [] }) };
  window.mediaLibrary = { getPreviewUrl: async () => ({ url: '' }) };
});
const mount = (name, props = {}) => page.evaluate(([name, props]) => window.mountComponent(name, props), [name, props]);
const check = async (name, fn) => { await fn(); passed.push(name); console.log('通过：' + name); };
const globalName = () => page.locator('.global-config-field').filter({ has: page.locator('.global-config-label').filter({ hasText: /^名称$/ }) }).locator('input');
const closeGlobal = async () => { await page.locator('.global-config-actions button').filter({ hasText: /^取消$/ }).click(); await page.locator('.global-config-dialog').waitFor({ state: 'hidden' }); };
try {
  await page.goto(`http://127.0.0.1:${http.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(() => window.mountComponent);
  await check('插入帧继承直接前帧，末尾新增与复制自动新增继承，首帧默认 1', async () => {
    await mount('SimpleGameEditorView', { gameId: 1 });
    await page.waitForFunction(() => window.getComponentSetup()?.editorFitReady);
    const button = name => page.getByRole('button', { name, exact: true });
    await button('在当前帧后添加帧').click();
    assert.deepEqual(await page.evaluate(() => window.getComponentSetup().activeLevel.frameList.map(frame => frame.repeatTimes)), [7, 7, 3]);
    await page.evaluate(() => window.getComponentSetup().selectFrame(2));
    await button('在当前帧后添加帧').click();
    assert.deepEqual(await page.evaluate(() => window.getComponentSetup().activeLevel.frameList.map(frame => frame.repeatTimes)), [7, 7, 3, 3]);
    await page.evaluate(() => { const s = window.getComponentSetup(); s.activeFrame.repeatTimes = 9; s.addFrame(); });
    assert.equal(await page.evaluate(() => window.getComponentSetup().activeFrame.repeatTimes), 9);
    await button('复制当前帧到后一帧').click();
    assert.equal(await page.evaluate(() => window.getComponentSetup().activeFrame.repeatTimes), 9);
    await page.evaluate(() => window.getComponentSetup().addLevel());
    assert.equal(await page.evaluate(() => window.getComponentSetup().activeFrame.repeatTimes), 1);
    assert.deepEqual(await page.evaluate(() => window.fixture.simple.levels[0].frameList.map(frame => frame.repeatTimes)), [7, 3]);
  });
  await check('循环次数显示次数整数输入，秒数仍显示时间值，保存 payload 保留次数', async () => {
    const timeMode = page.locator('.level-limit-fields select').first();
    await timeMode.selectOption('CYCLE_COUNT');
    const count = page.locator('.level-limit-fields label').filter({ has: page.locator('span').filter({ hasText: /^次数$/ }) }).locator('input');
    await count.fill('5');
    assert.equal(await count.getAttribute('step'), '1');
    const option = await page.evaluate(() => window.getComponentSetup().createEditorPayload().levels.at(-1).option);
    assert.equal(option.timeLimitMode, 'CYCLE_COUNT'); assert.equal(option.timeLimitValue, 5);
    await timeMode.selectOption('CYCLE_SECONDS');
    const seconds = page.locator('.level-limit-fields label').filter({ has: page.locator('span').filter({ hasText: /^时间值$/ }) }).locator('input');
    assert.equal(await seconds.inputValue(), '5');
    await timeMode.selectOption('UNLIMITED'); assert.equal(await seconds.count(), 0);
  });
  for (const mode of ['[1]', '[2]', '[3]']) await check(`${mode} 新建入口只弹一次配置，取消和保存均不创建游戏`, async () => {
    await page.evaluate(mode => { window.fixture.draftMode = mode; }, mode);
    await mount('App');
    await page.evaluate(() => { window.getComponentSetup().selectGameSection('list'); });
    await page.getByRole('button', { name: '新建游戏', exact: true }).click();
    await page.locator('.game-creation-dialog footer .primary').click();
    await page.locator('.global-config-dialog').waitFor();
    assert.equal(await globalName().inputValue(), 'Draft');
    await globalName().fill('取消的草稿名称'); await closeGlobal();
    await page.getByRole('button', { name: '全局配置', exact: true }).click();
    assert.equal(await globalName().inputValue(), 'Draft');
    await globalName().fill('本地草稿');
    await page.locator('.global-config-actions .primary').click();
    await page.locator('.global-config-dialog').waitFor({ state: 'hidden' });
    await page.locator('.editor-save-dialog button').click();
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    assert.deepEqual(await page.evaluate(() => window.fixture.reads), [1]);
    await page.getByRole('button', { name: '全局配置', exact: true }).click();
    assert.equal(await globalName().inputValue(), '本地草稿'); await closeGlobal();
  });
  await check('Rank 新建入口自动弹配置，取消不修改草稿，普通编辑不弹配置', async () => {
    await mount('App'); await page.evaluate(() => window.getComponentSetup().selectGameSection('list'));
    await page.getByRole('button', { name: '新建游戏', exact: true }).click();
    await page.locator('.game-creation-dialog').getByRole('button', { name: /排位赛/ }).click();
    await page.locator('.game-creation-dialog footer .primary').click();
    await page.locator('.global-config-dialog').waitFor();
    await globalName().fill('不保存'); await closeGlobal();
    await page.getByRole('button', { name: '全局配置', exact: true }).click();
    assert.equal(await globalName().inputValue(), 'Draft');
    await globalName().fill('Rank 本地草稿'); await page.locator('.global-config-actions .primary').click();
    await page.locator('.global-config-dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    for (const component of ['SimpleGameEditorView', 'RankGameEditorView']) {
      await mount(component, { gameId: component === 'SimpleGameEditorView' ? 1 : 2 });
      await page.waitForFunction(() => window.getComponentSetup()?.document && !window.getComponentSetup()?.loading && !window.getComponentSetup()?.busyAction);
      assert.equal(await page.locator('.global-config-dialog').count(), 0);
    }
    await page.screenshot({ path: path.join(output, '普通编辑不弹配置.png') });
  });
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: path.join(output, '失败.png') }); throw error;
} finally {
  await writeFile(path.join(output, '验收结果.json'), JSON.stringify({ passed, errors }, null, 2));
  await browser.close(); await server.close(); await new Promise(resolve => http.close(resolve));
}
