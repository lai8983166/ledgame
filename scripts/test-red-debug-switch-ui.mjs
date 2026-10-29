import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium, expect } = createRequire(path.join(root, '../ledGame-platform/package.json'))('@playwright/test');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/red-20261028/debug-switch-ui');
await mkdir(output, { recursive: true });
const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [], passed = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  let state = { engineState: 'IDLE', queueSummary: { waiting: [] } }, listener, seq = 0;
  const ret = () => ({ data: structuredClone(state) });
  const f = window.fixture = { requests: [], failStop: false, keepRunning: false, delayStop: false, failPrepare: false,
    publish(patch) { Object.assign(state, patch); listener?.(structuredClone(state)); },
    snapshot: () => structuredClone(state),
    game: { id: 1, name: '切关验收', type: 'default', minPlayers: 1, maxPlayers: 2, siteSizeWidth: 4, siteSizeHeight: 6,
      globalTimeLimit: true, globalTimeLimitValue: 120, commonConfig: {}, levels: [{ durationSeconds: 60 }, { durationSeconds: 45 }, { durationSeconds: 30 }] },
  };
  window.appLanguage = { get: async () => 'zh-CN', onChanged: () => () => {} };
  window.ledGame = {
    gameState: async () => ret(), prepareEditorDebugHardware: async () => {},
    onEngineState: fn => { listener = fn; return () => { listener = undefined; }; }, onLedFrame: () => () => {},
    createEditorPreparation: async options => {
      f.requests.push(['prepare', structuredClone(options)]);
      if (f.failPrepare) throw Error('准备失败');
      state = { engineState: 'PREPARING', sessionId: 'switch-' + ++seq, preparation: { sessionId: 'switch-' + seq, options }, playerAccesses: [], queueSummary: { waiting: [] } };
      return ret();
    },
    updatePreparation: async (id, patch) => { state.playerAccesses = patch.tokenList.map(uid => ({ access: { uid, remainingSeconds: 3600 } })); return ret(); },
    confirmPreparation: async () => {
      f.requests.push(['confirm', state.sessionId]);
      state = { ...state, currentStageIndex: state.preparation.options.startLevelIndex, preparation: null,
        engineState: 'RUNNING', gameplay: { score: 0, life: 3 }, gameTime: { mode: 'LIMITED', remainingMillis: 120000 } };
      return ret();
    },
    cancelPreparation: async () => { f.requests.push(['cancel']); state = { engineState: 'IDLE', queueSummary: { waiting: [] } }; return ret(); },
    sendDebugCommand: async command => {
      f.requests.push(['command', structuredClone(command)]);
      if (command.command === 'endgame') {
        if (f.failStop) throw Error('停止失败');
        if (f.delayStop) await new Promise(resolve => { f.releaseStop = resolve; });
        if (!f.keepRunning) state = { engineState: 'STOPPED', queueSummary: { waiting: [] } };
      } else if (command.command === 'pause') state.engineState = 'PAUSED';
      else if (command.command === 'resume') state.engineState = 'RUNNING';
      return ret();
    },
  };
});
const button = name => page.getByRole('button', { name, exact: true });
const level = page.locator('[data-debug-field=startLevel]');
const count = kind => page.evaluate(kind => window.fixture.requests.filter(item => item[0] === kind).length, kind);
const snapshot = () => page.evaluate(() => window.fixture.snapshot());
async function check(name, fn) { await fn(); passed.push(name); console.log('通过：' + name); }
try {
  await page.goto(`http://127.0.0.1:${port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(() => window.mountComponent);
  await page.evaluate(() => window.mountComponent('EditorDebugWorkspace', { game: window.fixture.game }));
  await expect(button('启动游戏')).toBeEnabled();
  await button('启动游戏').click();
  await check('运行中切到所选关，清理先于新准备并重置本局显示', async () => {
    await page.evaluate(() => window.fixture.publish({ gameplay: { score: 99, life: 1 }, gameTime: { mode: 'LIMITED', remainingMillis: 7000 } }));
    await expect(level).toBeEnabled(); await level.fill('2'); await button('切换关卡').click();
    const state = await snapshot(); assert.equal(state.currentStageIndex, 1);
    assert.deepEqual(state.gameplay, { score: 0, life: 3 }); assert.equal(state.gameTime.remainingMillis, 120000);
    const last = await page.evaluate(() => window.fixture.requests.slice(-3));
    assert.equal(last[0][1].command, 'endgame'); assert.equal(last[1][0], 'prepare'); assert.equal(last[1][1].startLevelIndex, 1); assert.equal(last[2][0], 'confirm');
  });
  await check('暂停中同样从所选关重新运行，准备和过渡中禁用切关', async () => {
    await button('暂停').click(); await level.fill('3'); await button('切换关卡').click();
    assert.equal((await snapshot()).engineState, 'RUNNING'); assert.equal((await snapshot()).currentStageIndex, 2);
    for (const engineState of ['STARTING', 'SETTLING']) {
      await page.evaluate(engineState => window.fixture.publish({ engineState }), engineState);
      await expect(level).toBeDisabled(); await expect(button('切换关卡')).toBeDisabled();
    }
    await page.evaluate(() => window.fixture.publish({ engineState: 'RUNNING' }));
  });
  await check('非法关卡在停止前拒绝，保留原会话', async () => {
    for (const value of ['', '0', '4', '1.5']) {
      const before = await page.evaluate(() => window.fixture.requests.length), id = (await snapshot()).sessionId;
      await level.fill(value); await button('切换关卡').click(); await expect(page.getByRole('alert')).toBeVisible();
      assert.equal(await page.evaluate(() => window.fixture.requests.length), before); assert.equal((await snapshot()).sessionId, id);
    }
    await level.fill('2');
  });
  await check('停止报错或未真正停止均不创建第二会话，可恢复重试', async () => {
    for (const flag of ['failStop', 'keepRunning']) {
      const before = await count('prepare'); await page.evaluate(flag => { window.fixture[flag] = true; }, flag);
      await button('切换关卡').click(); await expect(page.getByRole('alert')).toBeVisible(); assert.equal(await count('prepare'), before);
      await expect(button('切换关卡')).toBeEnabled(); await page.evaluate(flag => { window.fixture[flag] = false; }, flag);
    }
    await button('切换关卡').click(); assert.equal((await snapshot()).currentStageIndex, 1);
  });
  await check('切关处理中重复点击不重复停止或准备', async () => {
    await page.evaluate(() => { window.fixture.delayStop = true; });
    const before = await count('prepare'); await level.fill('1'); await button('切换关卡').click();
    await expect(button('切换关卡')).toBeDisabled(); await expect(level).toBeDisabled();
    await page.evaluate(() => { const setup = window.getComponentSetup(); setup.restart(); setup.restart(); });
    assert.equal(await count('prepare'), before);
    await page.evaluate(() => { window.fixture.delayStop = false; window.fixture.releaseStop(); });
    await expect(button('切换关卡')).toBeEnabled(); assert.equal(await count('prepare'), before + 1); assert.equal((await snapshot()).currentStageIndex, 0);
  });
  await check('新准备失败后恢复启动入口，重试使用所选关', async () => {
    await page.evaluate(() => { window.fixture.failPrepare = true; }); await level.fill('3'); await button('切换关卡').click();
    await expect(page.getByRole('alert')).toContainText('准备失败'); await expect(button('启动游戏')).toBeEnabled();
    await page.evaluate(() => { window.fixture.failPrepare = false; }); await button('启动游戏').click(); assert.equal((await snapshot()).currentStageIndex, 2);
  });
  await check('手环切关复用重新开始流程，清空旧参与者并重新扫码', async () => {
    await page.evaluate(async () => { await window.getComponentSetup().cleanup(); window.mountComponent('EditorDebugWorkspace', { game: { ...window.fixture.game, type: 'rank' } }); });
    await page.locator('select').first().selectOption('wristband'); await button('启动游戏').click();
    await expect(page.locator('.debug-scan-backdrop')).toBeVisible(); await expect(level).toBeDisabled();
    await page.keyboard.type('123456'); await page.keyboard.press('Enter'); await button('启动游戏').click();
    await button('暂停').click(); await level.fill('2'); await button('切换关卡').click();
    await expect(page.locator('.debug-scan-backdrop')).toBeVisible(); assert.equal((await snapshot()).engineState, 'PREPARING');
    assert.deepEqual((await snapshot()).playerAccesses, []); await expect(button('切换关卡')).toBeDisabled();
    await page.keyboard.type('654321'); await page.keyboard.press('Enter'); await button('启动游戏').click();
    assert.equal((await snapshot()).currentStageIndex, 1); assert.equal((await snapshot()).playerAccesses[0].access.uid, '654321');
    await page.screenshot({ path: path.join(output, '调试切关.png') });
  });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed, errors }, null, 2));
} finally { await browser.close(); await server.close(); }
