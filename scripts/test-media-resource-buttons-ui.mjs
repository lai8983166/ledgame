import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium, expect } = createRequire(path.join(root, '../ledGame-platform/package.json'))('@playwright/test');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/media-resource-buttons-ui');
await mkdir(output, { recursive: true });
const server = await createServer({ root, cacheDir: path.join(root, '.build/media-resource-buttons-vite-cache'),
  optimizeDeps: { noDiscovery: true, include: ['vue', 'vue-i18n', 'gifenc'] },
  server: { host: '127.0.0.1', port: 0, hmr: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(10000);
const passed = [], errors = [];
const videoBytes = await readFile(path.join(root, '.build/intro-media-fixtures/intro.mp4')).catch(() => readFile(path.join(root, 'build-resources/media/dashboard/idle.mp4')));
const videoUrl = 'data:video/mp4;base64,' + videoBytes.toString('base64');
page.on('pageerror', error => errors.push(error.message));
const buffer = Buffer.alloc(44 + 16000 * 2 * 5);
buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(16000, 24); buffer.writeUInt32LE(32000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
buffer.write('data', 36); buffer.writeUInt32LE(buffer.length - 44, 40);
await page.addInitScript(({audioUrl, videoUrl}) => {
  const frame = () => ({ repeatTimes: 1, matrix: [] });
  window.fixture = { saves: 0, slow: false, audioUrl, videoUrl, doc: {
    id: 7, name: '资源按钮测试', type: 'default', mode: '[1]', cover: 'cover.png', firstCatalog: '1', siteSizeWidth: 16, siteSizeHeight: 36,
    audio: { scoreSound: 'score.mp3', injurySound: 'injury.mp3', purpleSound: 'double.mp3' },
    gif: { standby: 'idle.gif', gameFailure: 'fail.gif', gameOver: 'over.gif' },
    commonConfig: { gameStartAudio: 'start.mp3', gameEndSuccessAudio: 'success.mp3', gameEndFailAudio: 'fail.mp3', levelPassAudio: 'pass.mp3', levelRestartAudio: 'restart.mp3', playIntroVideo: 'samples/intro.mp4' },
    levels: [0, 1].map(i => ({ label: '关卡' + (i + 1), option: { rewardPoints: 0, timeLimitMode: 'UNLIMITED', lifeLimitMode: 'UNLIMITED', bgVoice: '', playIntroVideo: '', voiceDesc: '', desc: '' }, frameList: [frame(), frame()] })),
  } };
  window.ledGame = {
    getGameEditor: async () => ({ data: structuredClone(window.fixture.doc) }),
    saveGameEditor: async (_id, doc) => { window.fixture.saves++; window.fixture.doc = structuredClone(doc); return { data: { saved: true, gameId: 7 } }; },
    listGameCategories: async () => ({ data: [{ id: 1, name: '分类' }] }),
  };
  window.spiritLibrary = { list: async () => ({ data: [] }) };
  window.mediaLibrary = {
    list: async () => ({ items: [{ kind: 'directory', name: 'samples', relativePath: 'samples', children: [
      { kind: 'file', name: 'background.wav', relativePath: 'samples/background.wav', mediaType: 'audio' },
      { kind: 'file', name: 'voice.wav', relativePath: 'samples/voice.wav', mediaType: 'audio' },
      { kind: 'file', name: 'intro.mp4', relativePath: 'samples/intro.mp4', mediaType: 'video' },
    ] }] }),
    getPreviewUrl: async asset => {
      const result = { url: asset.endsWith('.mp4') ? window.fixture.videoUrl : audioUrl, mediaType: asset.endsWith('.mp4') ? 'video' : 'audio' };
      if (window.fixture.slow) return new Promise(resolve => { window.fixture.resolvePreview = () => resolve(result); });
      return result;
    },
  };
}, {audioUrl: 'data:audio/wav;base64,' + buffer.toString('base64'), videoUrl});
const button = name => page.getByRole('button', { name, exact: true });
const popup = () => page.getByTestId('media-resource-preview');
const tile = id => page.locator('#' + id).locator('..');
async function choose(label, asset) {
  await button('选择 ' + label).click();
  const picker = page.locator('.media-picker-dialog');
  const dir = picker.locator('[data-path="samples"]');
  if (await dir.getAttribute('aria-expanded') !== 'true') await dir.click();
  await picker.locator('[data-path="' + asset + '"]').dblclick();
  await expect(picker).toHaveCount(0);
}
async function assertReleased(element) {
  assert.equal(await element.evaluate(e => e.paused), true);
  assert.equal(await element.evaluate(e => e.hasAttribute('src')), false);
}
async function check(name, run) { await run(); passed.push(name); console.log('通过：' + name); }
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`, { timeout: 30000 });
  await page.waitForFunction(() => window.mountComponent);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => window.mountComponent('SimpleGameEditorView', { gameId: 7 }));
  await page.waitForFunction(() => window.getComponentSetup()?.editorFitReady);
  await check('三个资源空时为方形加号按钮，无清除按钮或内联播放器，选择取消不改草稿', async () => {
    for (const id of ['level-background-music', 'level-gameplay-intro', 'level-voice-description']) {
      const b = page.locator('#' + id), box = await b.boundingBox();
      assert.ok(Math.abs(box.width - box.height) < .5); assert.equal((await b.innerText()).trim(), '+');
      await expect(tile(id).locator('.media-resource-clear')).toHaveCount(0);
    }
    await expect(page.locator('.editor-level-media audio,.editor-level-media video')).toHaveCount(0);
    await button('选择 语音说明').click(); await page.locator('.media-picker-actions').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await tile('level-voice-description').getAttribute('data-resource'), '');
  });
  await check('选择资源保留完整引用并显示文件名和播放图标，圆形叉号只清除对应资源', async () => {
    await choose('关卡背景音乐', 'samples/background.wav'); await choose('语音说明', 'samples/voice.wav'); await choose('玩法介绍', 'samples/intro.mp4');
    for (const [id, name] of [['level-background-music', 'background.wav'], ['level-gameplay-intro', 'intro.mp4'], ['level-voice-description', 'voice.wav']]) {
      assert.equal(await tile(id).getAttribute('data-resource'), 'samples/' + name);
      await expect(page.locator('#' + id).locator('svg')).toHaveCount(1); assert.equal(await tile(id).locator('.media-resource-name').textContent(), name);
      const clear = await tile(id).locator('.media-resource-clear').evaluate(e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, radius: getComputedStyle(e).borderRadius }; });
      assert.ok(Math.abs(clear.w - clear.h) < .5); assert.equal(clear.radius, '50%');
    }
    await button('清除 语音说明').click(); await expect(page.locator('.media-picker-dialog')).toHaveCount(0);
    assert.equal(await tile('level-background-music').getAttribute('data-resource'), 'samples/background.wav');
    assert.equal(await tile('level-voice-description').getAttribute('data-resource'), '');
    await choose('语音说明', 'samples/voice.wav'); assert.equal(await page.evaluate(() => window.fixture.saves), 0);
    await page.screenshot({ path: path.join(output, '三个方形资源按钮.png') });
  });
  await check('音频点击后实际播放，弹窗阻止编辑快捷键，Esc关闭释放播放器并恢复按钮焦点', async () => {
    await button('预览文件 语音说明').click(); const audio = popup().locator('audio');
    await expect.poll(() => audio.evaluate(e => e.currentTime)).toBeGreaterThan(.03);
    const old = await audio.elementHandle(); await page.keyboard.press('d');
    assert.equal(await page.evaluate(() => window.getComponentSetup().activeFrameIndex), 0);
    await page.keyboard.press('Escape'); await expect(popup()).toHaveCount(0); await assertReleased(old);
    await expect(page.locator('#level-voice-description')).toBeFocused();
  });
  await check('视频弹窗真实解码并等比适配小屏幕，关闭按钮停止资源且保留配置', async () => {
    await page.setViewportSize({ width: 800, height: 600 }); await button('预览文件 玩法介绍').click();
    const video = popup().locator('video'); await expect.poll(() => video.evaluate(e => e.readyState)).toBeGreaterThan(1);
    const geometry = await video.evaluate(e => { const r = e.getBoundingClientRect(); return { ratio: e.videoWidth / e.videoHeight, x: r.x, y: r.y, w: r.width, h: r.height, fit: getComputedStyle(e).objectFit }; });
    assert.ok(Math.abs(geometry.ratio - 16 / 9) < .01); assert.equal(geometry.fit, 'contain');
    assert.ok(geometry.x >= 0 && geometry.y >= 0 && geometry.x + geometry.w <= 801 && geometry.y + geometry.h <= 601);
    await page.screenshot({ path: path.join(output, '小屏视频播放窗口.png') });
    const old = await video.elementHandle(); await popup().getByRole('button', { name: '关闭', exact: true }).click();
    await expect(popup()).toHaveCount(0); await assertReleased(old);
    assert.equal(await tile('level-gameplay-intro').getAttribute('data-resource'), 'samples/intro.mp4'); await page.setViewportSize({ width: 1366, height: 900 });
  });
  await check('全局玩法介绍复用控件，Esc只关闭预览；清除和重选仍遵循全局取消边界', async () => {
    await button('全局配置').click(); const field = page.locator('.global-config-field').filter({ has: page.locator('#global-gameplay-intro') });
    await field.getByRole('button', { name: '预览文件 玩法介绍', exact: true }).click();
    await expect(popup().locator('video')).toHaveCount(1); await page.keyboard.press('Escape');
    await expect(page.locator('.global-config-dialog')).toHaveCount(1); await expect(popup()).toHaveCount(0);
    await field.getByRole('button', { name: '清除 玩法介绍', exact: true }).click();
    await choose('玩法介绍', 'samples/intro.mp4');
    await page.locator('.global-config-actions').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.doc.commonConfig.playIntroVideo), 'samples/intro.mp4');
    assert.equal(await page.evaluate(() => window.fixture.saves), 0);
  });
  await check('切关关闭正在播放的同名资源，关闭后迟到URL不复活，卸载停止播放器', async () => {
    await page.evaluate(() => { const e = window.getComponentSetup(); e.document.levels[1].option.voiceDesc = e.document.levels[0].option.voiceDesc; });
    await button('预览文件 语音说明').click(); const old = await popup().locator('audio').elementHandle();
    await page.evaluate(() => { window.getComponentSetup().activeLevelIndex = 1; });
    await expect(popup()).toHaveCount(0); await assertReleased(old);
    await page.evaluate(() => { window.fixture.slow = true; }); await button('预览文件 语音说明').click();
    await page.waitForFunction(() => window.fixture.resolvePreview); await page.keyboard.press('Escape');
    await page.evaluate(() => { window.fixture.slow = false; window.fixture.resolvePreview(); }); await page.waitForTimeout(50); await expect(popup()).toHaveCount(0);
    await button('预览文件 语音说明').click(); const unmounted = await popup().locator('audio').elementHandle();
    await page.evaluate(() => window.mountComponent('GameGlobalConfigDialog', { config: window.fixture.doc }));
    await expect(popup()).toHaveCount(0); await assertReleased(unmounted);
  });
  assert.deepEqual(errors, []);
} catch (error) {
  errors.push(error.stack); await page.screenshot({ path: path.join(output, '失败.png') }).catch(() => {}); throw error;
} finally {
  await writeFile(path.join(output, '验证记录.json'), JSON.stringify({ passed, errors }, null, 2));
  await browser.close(); await server.close();
}
