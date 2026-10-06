import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '../ledGame-platform/package.json'));
const { chromium } = require('playwright');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/settings-touch-ui');
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await context.addInitScript(() => {
  let settings = { applicationTitle: 'LED Game', entryMethod: 'touch', mode: 'debug', memberPlatformHost: '127.0.0.1', memberPlatformPort: 18090 };
  let games = [1, 2, 3, 4].map(id => ({ id, name: `Game ${id}`, type: id === 4 ? 'rank' : 'default', mode: '[1]', levels: [], participants: 4, childModeVisible: true }));
  let runtime = { engineState: 'IDLE', runtimeMode: 'SIMULATION' };
  let catalogListener, stateListener;
  window.fixture = { patches: [], canceled: [], failSave: false, failList: false, delay: 0, capture: [], actions: [], listeners: 0, settings, catalogResults: [],
    hide: id => { games.find(game => game.id === id).childModeVisible = false; catalogListener?.({ gameId: id }); },
    show: id => { games.find(game => game.id === id).childModeVisible = true; catalogListener?.({ gameId: id }); },
    broadcast: state => { runtime = state; stateListener?.(structuredClone(state)); },
    notify: () => catalogListener?.({}),
    games: () => structuredClone(games),
  };
  window.appLanguage = { get: async () => 'zh-CN', set: async locale => locale, onChanged: () => () => {} };
  window.appSettings = { get: async () => structuredClone(settings), onChanged: () => () => {},
    update: async patch => { settings = { ...settings, ...patch }; window.fixture.settings = settings; return structuredClone(settings); },
    testMemberPlatform: async data => { window.fixture.testAddress = data; return { reachable: true }; },
    chooseIcon: async () => ({ canceled: true }), chooseSecondaryBackground: async () => ({ canceled: true }), chooseSecondaryIdleMedia: async () => ({ canceled: true }) };
  window.secondaryDisplay = { list: async () => ({ displays: [] }), onChanged: () => () => {} };
  window.ledGame = {
    listGames: async () => ({ data: structuredClone(games) }), seedSimpleVariants: async () => {}, seedRankType1: async () => {},
    listManageableGames: async () => ({ data: structuredClone(games) }),
    listPlayableGames: async () => { if (window.fixture.failList) throw new Error('Catalog unavailable'); const visible = games.filter(g => g.childModeVisible !== false); window.fixture.catalogResults.push(visible.map(g => g.id)); return { data: structuredClone(visible) }; },
    listGameCategories: async () => ({ data: [] }),
    updateGameMetadata: async (id, patch) => { window.fixture.patches.push(patch); await new Promise(resolve => setTimeout(resolve, window.fixture.delay)); if (window.fixture.failSave) throw new Error('Write failed'); games = games.map(g => g.id === id ? { ...g, ...patch } : g); catalogListener?.({ gameId: id }); return { data: true }; },
    onCatalogChanged: listener => { catalogListener = listener; window.fixture.listeners++; return () => { catalogListener = null; window.fixture.listeners--; }; },
    onEngineState: listener => { stateListener = listener; return () => { stateListener = null; }; },
    touchGameState: async () => ({ data: structuredClone(runtime) }), state: async () => ({ data: structuredClone(runtime) }),
    touchPresentationMode: async () => settings.mode,
    getGameEditor: async id => ({ data: { id, name: `Game ${id}`, type: 'default', siteSizeWidth: 16, siteSizeHeight: 36, levels: [] } }),
    cancelPreparation: async id => { window.fixture.canceled.push(id); runtime = { engineState: 'IDLE' }; return { data: runtime }; },
  };
  window.mediaLibrary = { list: async () => ({ exists: true, items: [] }), getPreviewUrl: async () => ({ url: '' }) };
  window.spiritLibrary = { list: async () => ({ data: [] }) };
  window.elc408Tools = {
    networkInterfaces: async () => ({ data: [{ id: 'nic', name: 'ASIX', localAddress: '169.254.1.10', prefixLength: 16 }] }),
    debugState: async () => ({ data: { debugRunning: false } }),
    setLogCapture: async enabled => { window.fixture.capture.push(enabled); return { data: { enabled } }; },
    logs: async () => ({ data: { nextCursor: 1, entries: [{ seq: 1, timestamp: Date.now(), direction: 'RECEIVE', type: 'RGB_REPLY', hex: '88 '.repeat(200) }] } }),
    clearLogs: async () => { window.fixture.actions.push('clear'); return { data: {} }; },
    search: async payload => { window.fixture.actions.push(['search', payload]); return { data: { controllers: [{ mac: 'AA-BB', sourceIp: '169.254.1.20' }] } }; },
    testPoint: async payload => { window.fixture.actions.push(['point', payload]); return { data: {} }; },
    start: async payload => { window.fixture.actions.push(['start', payload]); return { data: { debugRunning: true } }; },
    stop: async () => { window.fixture.actions.push('stop'); return { data: { debugRunning: false } }; },
  };
});
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const passed = [];
async function mount(name, props = {}) { await page.evaluate(([name, props]) => window.mountComponent(name, props), [name, props]); }
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS ' + name); }
async function noOverflow() { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(() => window.mountComponent);
  await check('配置隐藏端口，修改 IP、标题、取消文件选择后可继续输入', async () => {
    await mount('ApplicationSettingsView'); await page.locator('.application-settings-field input').first().waitFor();
    assert.equal(await page.locator('input[max="65535"]').count(), 0);
    const host = page.locator('.application-settings-connection input[type=text]').last();
    await host.fill('192.168.50.10');
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.fixture.testAddress), { memberPlatformHost: '192.168.50.10', memberPlatformPort: 18090 });
    await page.getByRole('button', { name: '选择应用图标', exact: true }).click();
    await page.locator('.application-settings-field input').first().fill('Changed title');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.settings.memberPlatformPort), 18090);
    for (const [width, height] of [[1366,768],[1920,1080],[2560,1440],[600,800]]) {
      await page.setViewportSize({ width, height }); await noOverflow();
      if (width > 720) {
        const boxes = await page.locator('.application-settings-field').first().evaluate(node => [node.firstElementChild.getBoundingClientRect().y, node.querySelector('input').getBoundingClientRect().y]);
        assert.ok(Math.abs(boxes[0] - boxes[1]) < 20);
      }
      await page.screenshot({ path: path.join(output, `settings-${width}.png`), fullPage: true });
    }
  });
  await page.setViewportSize({width:1366,height:768});
  await check('硬件助手两页，操作控件横排、长日志展开、搜索与发送停止、隐藏页停止采样', async () => {
    await mount('Elc408DebugAssistantView');
    assert.equal(await page.getByRole('tab').count(), 2);
    assert.equal(await page.getByRole('tab').first().getAttribute('aria-selected'), 'true');
    for (const label of ['单行', '单列', '折返行', '折返列']) assert.equal(await page.getByText(label, { exact: true }).count(), 1);
    await page.getByRole('tab').last().click();
    await page.locator('.elc408-debug-controls select').first().selectOption('nic');
    assert.equal(await page.locator('.elc408-debug-controls select').nth(2).inputValue(), 'GRB');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.locator('.elc408-log-expand').click();
    assert.ok((await page.locator('.elc408-hex-value').innerText()).length > 500);
    await page.getByRole('button', { name: '测试单点', exact: true }).click();
    await page.getByRole('button', { name: '开始', exact: true }).click();
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await page.getByRole('button', { name: '清空日志', exact: true }).click();
    for (const [width,height] of [[1366,768],[1920,1080],[2560,1440]]) {
      await page.setViewportSize({width,height}); await noOverflow();
      await page.screenshot({ path: path.join(output, `debug-${width}.png`) });
    }
    await page.getByRole('tab').first().click();
    await page.waitForFunction(() => window.fixture.capture.at(-1) === false);
  });
  await page.setViewportSize({width:1366,height:768});
  await check('中文英文页面仅保留主标题，资源、名称与必要提示保留', async () => {
    for (const locale of ['zh-CN','en-US']) {
      await page.evaluate(locale => window.changeTestLocale(locale), locale);
      for (const component of ['ApplicationSettingsView','GameListView','MediaLibraryView','SpiritLibraryView','Elc408DebugAssistantView']) {
        await mount(component, {section:'list'});
        await page.locator('h1').waitFor();
        assert.equal(await page.locator('h1 + p').count(), 0);
      }
      await page.screenshot({path:path.join(output,`heading-${locale}.png`)});
    }
    await page.evaluate(() => window.changeTestLocale('zh-CN'));
  });
  await check('真实游戏信息弹窗独立保存显示开关，取消其他草稿、失败回滚、禁重复保存', async () => {
    await mount('GameListView', { section: 'list' });
    const open = () => page.locator('.game-card[data-id="1"] .game-card-edit').click();
    await open(); await page.locator('.game-info-name input').fill('Unsaved name');
    await page.locator('.game-info-visibility input').uncheck();
    await page.waitForFunction(() => window.fixture.games()[0].childModeVisible === false);
    assert.deepEqual(await page.evaluate(() => window.fixture.patches.at(-1)), { childModeVisible: false });
    await page.locator('.game-info-actions .soft-button').click(); await open();
    assert.equal(await page.locator('.game-info-name input').inputValue(), 'Game 1');
    assert.equal(await page.locator('.game-info-visibility input').isChecked(), false);
    await page.evaluate(() => { window.fixture.failSave = true; window.fixture.delay = 200; });
    await page.locator('.game-info-visibility input').check();
    assert.equal(await page.locator('.game-info-visibility input').isDisabled(), true);
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('.game-info-visibility input').isChecked(), false);
    await page.evaluate(() => { window.fixture.failSave = false; window.fixture.delay = 0; });
    await page.locator('.game-info-visibility input').check();
    await page.waitForFunction(() => window.fixture.games()[0].childModeVisible === true);
  });
  await check('调试/游戏模式及触屏/手环/投币六个入口使用同一隐藏目录', async () => {
    await page.evaluate(() => window.fixture.hide(1));
    for (const mode of ['debug','game']) for (const entryMethod of ['touch','wristband','coin']) {
      const before = await page.evaluate(() => window.fixture.catalogResults.length);
      await page.evaluate(async ({mode,entryMethod}) => {
        await window.appSettings.update({mode,entryMethod});
        window.fixture.broadcast({engineState:'PREPARING',preparation:{sessionId:mode+entryMethod,gameId:null,options:{userCount:1,launchMethod:entryMethod}}});
      }, {mode,entryMethod});
      await mount('LedGameTouchView');
      await page.waitForFunction(before => window.fixture.catalogResults.length > before, before);
      assert.deepEqual(await page.evaluate(() => window.fixture.catalogResults.at(-1)), [2,3,4]);
      assert.equal(await page.locator('.touch-shell').evaluate(node => node.classList.contains('touch-game-presentation')), mode === 'game');
    }
    await page.evaluate(async () => { window.fixture.show(1); await window.appSettings.update({mode:'debug',entryMethod:'wristband'}); });
  });
  const prepare = {engineState:'PREPARING',preparation:{sessionId:'session',gameId:1,gameName:'Game 1',options:{userCount:1,launchMethod:'touch',runtimeMode:'SIMULATION'}}};
  await check('Touch 成功刷新才释放准备，刷新失败保留选择，运行与队列不变，监听清理', async () => {
    await page.evaluate(state => window.fixture.broadcast(state), prepare);
    await mount('LedGameTouchView'); await page.locator('.touch-shell[data-state="PREPARING"]').waitFor();
    await page.evaluate(() => { window.fixture.failList = true; window.fixture.hide(1); });
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => window.fixture.canceled), []);
    await page.evaluate(() => { window.fixture.failList = false; });
    await page.getByTestId('game-error').getByRole('button', {name:'重新加载',exact:true}).click();
    await page.waitForFunction(() => window.fixture.canceled.includes('session'));
    await page.evaluate(() => { window.fixture.show(1); window.fixture.broadcast({engineState:'RUNNING',gameId:1,gameName:'Game 1',queueSummary:{waiting:[{gameId:1}]}}); });
    await page.locator('.touch-shell[data-state="RUNNING"]').waitFor();
    await page.evaluate(() => window.fixture.hide(1)); await page.waitForTimeout(100);
    assert.equal(await page.locator('.touch-shell').getAttribute('data-state'), 'RUNNING');
    assert.equal(await page.evaluate(() => window.fixture.canceled.length), 1);
    await page.getByTestId('game-queue-open').click();
    await page.getByTestId('game-queue-game').waitFor();
    assert.deepEqual(await page.getByTestId('game-queue-game').locator('option:not(:disabled)').evaluateAll(nodes => nodes.map(node => Number(node.value))), [2,3,4]);
    assert.equal(await page.getByTestId('game-queue-waiting').locator('div').count(), 1);
    await mount('ApplicationSettingsView');
    assert.equal(await page.evaluate(() => window.fixture.listeners), 0);
  });
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); throw error;
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed, errors }, null, 2));
  await browser.close(); await server.close();
}
