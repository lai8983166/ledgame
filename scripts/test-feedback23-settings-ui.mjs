import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '../ledGame-platform/package.json'));
const { chromium } = require('playwright');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/feedback23-settings-ui');
await mkdir(output, { recursive: true });
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false } });
const server = http.createServer(vite.middlewares);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const passed = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  let settings = { applicationTitle: 'LED Game', entryMethod: 'touch', coinCount: 1, touchExitPassword: '12345678',
    secondaryIdlePromptText: 'UPPER', secondaryIdleSubtitleText: 'LOWER', secondaryIdlePromptFontSize: 96,
    memberPlatformHost: '127.0.0.1', memberPlatformPort: 8090, touchIdlePromptTexts: { 'zh-CN': '开始游戏' }, touchIdlePromptFontSize: 72 };
  const listeners = new Set();
  window.fixture = { writes: [], set: value => { settings = { ...settings, ...value }; for (const listener of listeners) listener(structuredClone(settings)); } };
  window.appLanguage = { get: async () => 'zh-CN', onChanged: () => () => {} };
  window.appSettings = { get: async () => structuredClone(settings), onChanged: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    update: async patch => { window.fixture.writes.push(structuredClone(patch)); settings = { ...settings, ...patch }; return structuredClone(settings); },
    getSecondaryBackground: async () => ({ dataUrl: '' }), getSecondaryIdleMedia: async () => ({ url: '', mediaType: '' }) };
  window.ledGame = { touchGameState: async () => ({ data: { engineState: 'IDLE' } }), onEngineState: () => () => {} };
  window.mediaLibrary = { getPreviewUrl: async () => ({ url: '' }) };
});
async function mount(component, props = {}) { await page.evaluate(([component, props]) => window.mountComponent(component, props), [component, props]); }
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS ' + name); }
// Locate bound inputs through their stable numeric limits or visible label, without mutating component state.
const save = () => page.locator('.application-settings-save');
const font = index => page.locator('input[min="32"]').nth(index);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(() => window.mountComponent);
  await check('保存密码初始回显、保存后保留、重新进入仍回显，空密码继续保留原密码', async () => {
    await mount('ApplicationSettingsView');
    const password = page.locator('input[maxlength="12"]');
    await password.waitFor();
    assert.equal(await password.inputValue(), '12345678');
    assert.equal(await save().isDisabled(), true);
    await password.fill('23456789'); await save().click();
    assert.equal(await password.inputValue(), '23456789');
    assert.equal(await save().isDisabled(), true);
    await mount('ApplicationSettingsView');
    assert.equal(await password.inputValue(), '23456789');
    await password.fill('');
    await page.locator('input[maxlength="64"]').first().fill('Changed title'); await save().click();
    assert.equal(await password.inputValue(), '23456789');
    assert.equal(await page.evaluate(() => Object.hasOwn(window.fixture.writes.at(-1), 'touchExitPassword')), false);
  });
  await check('非法密码、字号及超时即时反馈且不提交；修正后可保存', async () => {
    const password = page.locator('input[maxlength="12"]');
    const count = await page.evaluate(() => window.fixture.writes.length);
    await password.fill('ab12'); assert.equal(await password.getAttribute('aria-invalid'), 'true'); assert.equal(await save().isDisabled(), true);
    await password.fill('123456');
    for (const value of ['5', '72.5', '201', '']) { await font(0).fill(value); assert.equal(await font(0).getAttribute('aria-invalid'), 'true'); assert.equal(await save().isDisabled(), true); }
    await font(0).fill('80');
    const timeout = page.locator('input[max="3600"]');
    assert.equal(await timeout.inputValue(), '20');
    for (const value of ['0', '1.5', '3601', '']) { await timeout.fill(value); assert.equal(await timeout.getAttribute('aria-invalid'), 'true'); assert.equal(await save().isDisabled(), true); }
    assert.equal(await page.evaluate(() => window.fixture.writes.length), count);
    await timeout.fill('3600'); await save().click();
    assert.equal(await timeout.inputValue(), '3600');
    assert.equal(await page.evaluate(() => window.fixture.writes.at(-1).touchPreparationTimeoutSeconds), 3600);
    await timeout.fill('1'); await save().click();
    assert.equal(await timeout.inputValue(), '1');
  });
  await check('旧上下标题继承原字号，独立设置后只改变对应标题并响应广播', async () => {
    assert.equal(await font(1).inputValue(), '96'); assert.equal(await font(2).inputValue(), '96');
    await font(1).fill('120'); await font(2).fill('48'); await save().click();
    await mount('SecondaryDisplayView'); await page.locator('.touch-idle-prompt').nth(1).waitFor();
    assert.deepEqual(await page.locator('.touch-idle-prompt').evaluateAll(nodes => nodes.map(node => node.style.getPropertyValue('--idle-prompt-font-size'))), ['120px', '48px']);
    await page.evaluate(() => window.fixture.set({ secondaryIdleSubtitleFontSize: 64 }));
    await page.waitForFunction(() => document.querySelectorAll('.touch-idle-prompt')[1].style.getPropertyValue('--idle-prompt-font-size') === '64px');
    assert.equal(await page.locator('.touch-idle-prompt').first().evaluate(node => node.style.getPropertyValue('--idle-prompt-font-size')), '120px');
    await page.screenshot({ path: path.join(output, 'secondary-independent-fonts.png') });
  });
  await check('配置桌面布局紧凑，小屏无水平溢出，必填标记和错误紧邻输入', async () => {
    await mount('ApplicationSettingsView');
    for (const [width, height] of [[1366, 768], [600, 800], [360, 740]]) {
      await page.setViewportSize({ width, height });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (width > 720) { assert.ok((await page.locator('.application-settings-view').boundingBox()).width <= 920); assert.ok((await font(0).boundingBox()).width <= 420); }
      assert.ok(await page.locator('.required-mark').count() >= 7);
      await page.locator('input[maxlength="64"]').first().fill('');
      assert.equal(await save().isDisabled(), true);
      assert.equal(await page.locator('input[maxlength="64"]').first().getAttribute('aria-invalid'), 'true');
      await page.screenshot({ path: path.join(output, `settings-${width}.png`), fullPage: true });
      await page.locator('input[maxlength="64"]').first().fill('LED Game');
    }
  });
  await check('Simple与Rank全局场地尺寸同为1–50整数，旧96保持原值且拒绝提交', async () => {
    await page.setViewportSize({ width: 1366, height: 900 });
    const config = { name: 'Field', type: 'default', mode: '[1]', siteSizeWidth: 96, siteSizeHeight: 36, firstCatalog: '1', cover: 'cover.png',
      audio: { scoreSound: 'score.mp3', injurySound: 'injury.mp3', purpleSound: 'double.mp3' },
      gif: { standby: 'idle.gif', gameFailure: 'fail.gif', gameOver: 'over.gif' },
      commonConfig: { gameStartAudio: 'start.mp3', gameEndSuccessAudio: 'win.mp3', gameEndFailAudio: 'fail.mp3', levelPassAudio: 'pass.mp3', levelRestartAudio: 'restart.mp3' } };
    for (const rank of [false, true]) {
      await mount('GameGlobalConfigDialog', { config, rank, categories: [{ id: 1, name: 'Test' }] });
      const width = page.locator('.global-config-dialog input[max="50"]').first();
      const height = page.locator('.global-config-dialog input[max="50"]').nth(1);
      assert.equal(await width.inputValue(), '96'); assert.equal(await width.getAttribute('step'), '1');
      for (const value of ['96', '51', '1.5', '0']) {
        await width.fill(value); await page.locator('.global-config-actions .primary').click();
        await page.locator('.editor-save-dialog').waitFor();
        assert.match(await page.locator('.editor-save-dialog').innerText(), /1～50/);
        assert.deepEqual(await page.evaluate(() => window.componentEvents.filter(event => event[0] === 'save')), []);
        await page.locator('.editor-save-dialog button').click();
      }
      await width.fill('50'); await height.fill('50'); await page.locator('.global-config-actions .primary').click();
      const result = await page.evaluate(() => window.componentEvents.filter(event => event[0] === 'save'));
      assert.equal(result[0][0], 'save'); assert.equal(result[0][1].siteSizeWidth, 50); assert.equal(result[0][1].siteSizeHeight, 50);
      assert.equal(config.siteSizeWidth, 96);
    }
    await page.screenshot({ path: path.join(output, 'field-dimensions.png') });
  });
  assert.deepEqual(errors, []);
} catch (error) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); throw error; }
finally { await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed, errors }, null, 2)); await browser.close(); await new Promise(resolve => server.close(resolve)); await vite.close(); }
