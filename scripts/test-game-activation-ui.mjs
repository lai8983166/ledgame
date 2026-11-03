// Renderer-only activation checks: memory IPC fixtures, no database or daily user data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer as createHttpServer } from 'node:http';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium, expect } = createRequire(path.join(root, '../ledGame-platform/package.json'))('@playwright/test');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/game-activation-ui');
await mkdir(output, { recursive: true });
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false } });
const server = createHttpServer(vite.middlewares);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const passed = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(12000);
await page.addInitScript(() => {
  window.fixture = { status: { activated: false, machineCode: 'GAME-MACHINE-123', reasonCode: 'ACTIVATION_REQUIRED' }, calls: [], failStatus: false, deferStatus: false, failWorkspace: false };
  const business = name => { window.fixture.calls.push(name); if (window.fixture.failWorkspace) throw Error('workspace unavailable'); };
  window.appLanguage = { get: async () => 'zh-CN', onChanged: () => () => {} };
  window.appSettings = { get: async () => { business('settings'); return {}; }, getIconData: async () => { business('icon'); return {}; }, onChanged: () => () => {} };
  window.secondaryDisplay = { list: async () => { business('secondary'); return { displays: [] }; }, onChanged: () => () => {} };
  window.ledGame = {
    state: async () => { business('state'); return { data: { engineState: 'STOPPED' } }; },
    listManageableGames: async () => { business('games'); return { data: [] }; },
    listGameCategories: async () => { business('categories'); return { data: [] }; },
    onActivationChanged: callback => { window.fixture.changed = callback; return () => { window.fixture.removed = true; }; },
    activationStatus: async () => {
      window.fixture.calls.push('status');
      if (window.fixture.deferStatus) await new Promise(resolve => { window.fixture.resolveStatus = resolve; });
      if (window.fixture.failStatus) throw Error('backend unavailable');
      return { data: structuredClone(window.fixture.status) };
    },
    copyMachineCode: async () => { window.fixture.calls.push('copy'); return { data: structuredClone(window.fixture.status) }; },
    pasteActivationCode: async () => { window.fixture.calls.push('paste'); return window.fixture.clipboard || 'VALID-LICENSE'; },
    restoreFocus: async () => { window.fixture.calls.push('native-focus'); },
    exitUnactivated: async () => { window.fixture.calls.push('exit'); },
    closeWindow: async () => { window.fixture.calls.push('close'); },
    activate: async code => {
      window.fixture.calls.push(['activate', code]);
      if (code === 'VALID-LICENSE') {
        window.fixture.status = { activated: true, machineCode: 'GAME-MACHINE-123', licenseId: 'fixture-only' };
        window.fixture.changed?.(structuredClone(window.fixture.status));
      } else return { data: { ...window.fixture.status, message: '激活码签名无效' } };
      return { data: structuredClone(window.fixture.status) };
    },
    enterGameFlow: async () => { business('enter'); return {}; },
    gameState: async () => { business('game-state'); return { data: { running: false } }; },
    getGameEditor: async () => { business('editor'); return { data: { id: 1, type: 'default', levels: [] } }; },
  };
});
const button = name => page.getByRole('button', { name, exact: true });
const dialog = () => page.getByRole('dialog', { name: '软件激活', exact: true });
const check = async (name, fn) => { await fn(); passed.push(name); console.log('PASS ' + name); };
const help = () => page.locator('.nav-help-button').filter({ hasText: '帮助' });
const open = async () => { await help().click(); await page.getByRole('menuitem', { name: /^软件激活/ }).click(); await dialog().waitFor(); };
const mount = () => page.evaluate(() => window.mountComponent('App'));
const noWorkspace = async () => {
  await expect(page.getByTestId('activation-gate')).toBeVisible();
  await expect(page.locator('.app-nav, .game-list-view, .simple-editor-workspace, .secondary-display, .touch-view')).toHaveCount(0);
  await expect(page.getByTestId('game-menu-button')).toHaveCount(0);
};
const businessCalls = () => page.evaluate(() => window.fixture.calls.filter(call => ['settings', 'icon', 'state', 'secondary', 'games', 'categories', 'enter', 'game-state', 'editor'].includes(call)));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/ui/catalog-library-harness.html`, { timeout: 60000 });
  await page.waitForFunction(() => window.mountComponent);
  await check('激活查询等待期间不误报失败、不显示重试或未激活，不挂载业务及调用业务 API', async () => {
    await page.evaluate(() => { window.fixture.deferStatus = true; });
    await mount(); await dialog().waitFor(); await noWorkspace();
    await expect(dialog().getByRole('alert')).toHaveCount(0);
    await expect(dialog().getByRole('status')).toHaveCount(0);
    await expect(button('重试')).toHaveCount(0);
    assert.deepEqual(await businessCalls(), []);
    await page.screenshot({ path: path.join(output, '启动查询等待无误报.png') });
    await page.evaluate(() => { window.fixture.deferStatus = false; window.fixture.resolveStatus(); });
    await expect(dialog().locator('textarea').first()).toHaveValue('GAME-MACHINE-123');
    await noWorkspace(); assert.deepEqual(await businessCalls(), []);
  });
  await check('未激活关闭按钮、叉号和 Escape 退出软件，门禁不消失；点击外层不关闭', async () => {
    await page.locator('.activation-backdrop').click({ position: { x: 2, y: 2 } });
    assert.equal(await page.evaluate(() => window.fixture.calls.filter(call => call === 'exit').length), 0);
    for (const close of [() => dialog().getByRole('button', { name: '关闭', exact: true }).last().click(), () => dialog().locator('header button').click(), () => dialog().press('Escape')]) {
      const before = await page.evaluate(() => window.fixture.calls.filter(call => call === 'exit').length);
      await close(); await expect.poll(() => page.evaluate(() => window.fixture.calls.filter(call => call === 'exit').length)).toBe(before + 1);
      await dialog().waitFor(); await noWorkspace();
    }
    assert.deepEqual(await businessCalls(), []);
    assert.equal(await page.evaluate(() => window.fixture.calls.includes('native-focus')), false);
  });
  await check('机器码复制、按钮粘贴和 Ctrl+V 不抢原生窗口焦点，激活错误可重试', async () => {
    await button('复制机器码').click(); await expect(button('已复制')).toBeVisible();
    await button('粘贴激活码').click(); await expect(dialog().locator('textarea').last()).toHaveValue('VALID-LICENSE');
    await expect(dialog().locator('textarea').last()).toBeFocused();
    await page.evaluate(() => { window.fixture.clipboard = 'INVALID'; });
    await dialog().locator('textarea').last().press('Control+v');
    await button('激活').click(); await expect(dialog().getByRole('alert')).toHaveText('激活码签名无效');
    await expect(button('激活')).toBeEnabled(); await noWorkspace();
    assert.deepEqual(await businessCalls(), []);
    assert.equal(await page.evaluate(() => window.fixture.calls.includes('native-focus')), false);
    await page.screenshot({ path: path.join(output, '激活失败可重试.png') });
  });
  await check('真实读取失败保留错误与门禁，重新打开后激活成功只初始化一次业务', async () => {
    await page.evaluate(() => { window.fixture.failStatus = true; });
    await mount(); await expect(dialog().getByRole('alert')).toHaveText('无法读取激活状态，请重试。');
    await expect(button('重试')).toHaveCount(0);
    await noWorkspace(); assert.deepEqual(await businessCalls(), []);
    await page.evaluate(() => { window.fixture.failStatus = false; window.fixture.clipboard = 'VALID-LICENSE'; });
    await mount(); await expect(dialog().locator('textarea').first()).toHaveValue('GAME-MACHINE-123');
    await button('粘贴激活码').click(); await button('激活').click();
    await expect(page.getByTestId('game-menu-button')).toBeVisible();
    await expect(dialog()).toHaveCount(0);
    const calls = await businessCalls();
    for (const name of ['settings', 'state', 'secondary', 'icon']) assert.equal(calls.filter(call => call === name).length, 1, name);
    await page.evaluate(() => window.fixture.changed(structuredClone(window.fixture.status)));
    await open(); await expect(button('重试')).toHaveCount(0);
    assert.deepEqual(await businessCalls(), calls);
    assert.equal(await page.evaluate(() => window.fixture.calls.includes('enter')), false);
  });
  await check('已激活帮助弹窗焦点循环，关闭仅恢复 DOM 焦点，不退出或抢原生焦点', async () => {
    await dialog().getByRole('button', { name: '关闭', exact: true }).last().focus(); await page.keyboard.press('Tab');
    await expect(dialog().getByRole('button', { name: '关闭', exact: true }).first()).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(dialog().getByRole('button', { name: '关闭', exact: true }).last()).toBeFocused();
    const exitCount = await page.evaluate(() => window.fixture.calls.filter(call => call === 'exit').length);
    await dialog().press('Escape'); await expect(help()).toBeFocused();
    await open(); await dialog().locator('header button').click(); await expect(help()).toBeFocused();
    assert.equal(await page.evaluate(() => window.fixture.calls.includes('native-focus')), false);
    assert.equal(await page.evaluate(() => window.fixture.calls.filter(call => call === 'exit').length), exitCount);
    await page.getByTestId('game-enter-flow').click();
    await expect.poll(() => page.evaluate(() => window.fixture.calls.includes('enter'))).toBe(true);
  });
  await check('状态失效立即卸载业务并阻止所有导航', async () => {
    await page.evaluate(() => { window.fixture.status = { activated: false, machineCode: 'GAME-MACHINE-123' }; window.fixture.changed(structuredClone(window.fixture.status)); });
    await dialog().waitFor(); await noWorkspace();
    await page.screenshot({ path: path.join(output, '未激活仅激活界面.png') });
  });
  await check('首次已激活直接初始化一次，主界面不出现激活弹窗', async () => {
    await page.evaluate(() => { window.fixture.status = { activated: true, machineCode: 'GAME-MACHINE-123' }; window.fixture.calls = []; });
    await mount(); await expect(page.getByTestId('game-menu-button')).toBeVisible(); await expect(dialog()).toHaveCount(0);
    const calls = await businessCalls();
    for (const name of ['settings', 'state', 'secondary', 'icon']) assert.equal(calls.filter(call => call === name).length, 1, name);
  });
  await check('激活后主界面初始化失败仍不开放业务，重新打开恢复', async () => {
    await page.evaluate(() => { window.fixture.failWorkspace = true; });
    await mount(); await noWorkspace(); await expect(dialog().getByRole('alert')).toHaveText('workspace unavailable');
    await page.evaluate(() => { window.fixture.failWorkspace = false; });
    await expect(button('重试')).toHaveCount(0);
    await mount(); await expect(page.getByTestId('game-menu-button')).toBeVisible();
  });
  await check('缺失激活 API 和具体授权故障均停留门禁，子窗口也先验证激活', async () => {
    await page.evaluate(() => { window.fixture.savedStatusApi = window.ledGame.activationStatus; delete window.ledGame.activationStatus; window.fixture.calls = []; });
    await mount(); await dialog().waitFor(); await noWorkspace();
    await expect(dialog().getByRole('alert')).toHaveText('无法读取激活状态，请重试。'); assert.deepEqual(await businessCalls(), []);
    await page.evaluate(() => { window.ledGame.activationStatus = window.fixture.savedStatusApi; window.fixture.status = { activated: false, machineCode: 'GAME-MACHINE-123', reasonCode: 'PUBLIC_KEY_INVALID', message: '授权公钥无效' }; });
    await mount(); await expect(dialog().getByRole('alert')).toHaveText('授权公钥无效');
    for (const kind of ['debug', 'touch', 'secondary']) {
      await page.evaluate(kind => { window.ledGame.windowKind = kind; window.fixture.calls = []; }, kind);
      await mount(); await dialog().waitFor(); await noWorkspace(); assert.deepEqual(await businessCalls(), []);
    }
  });
  await check('14 种语言界面完整、600×480 窄屏无横向裁切、卸载清理订阅', async () => {
    for (const locale of ['zh-CN','en-US','es-ES','pt-PT','fr-FR','de-DE','pl-PL','ru-RU','vi-VN','it-IT','cs-CZ','ko-KR','ro-RO','ar-SA']) {
      await page.evaluate(locale => window.changeTestLocale(locale), locale);
      await expect(page.locator('.activation-dialog')).toBeVisible();
      assert.equal(await page.locator('.activation-dialog').innerText().then(text => text.includes('activation.')), false);
    }
    await page.setViewportSize({ width: 600, height: 480 });
    const bounds = await page.locator('.activation-dialog').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 601);
    assert.equal(await page.locator('.activation-dialog').evaluate(node => node.scrollWidth <= node.clientWidth), true);
    await page.screenshot({ path: path.join(output, '激活小屏.png') });
    await page.evaluate(() => window.mountComponent('GameEffectDialog', { frameList: [], gridWidth: 8, gridHeight: 8 }));
    assert.equal(await page.evaluate(() => window.fixture.removed), true);
  });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, '验证记录.json'), JSON.stringify({ passed, errors }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await vite.close(); }
