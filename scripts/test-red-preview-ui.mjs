// Real Vue/canvas interaction with in-memory IPC fixtures; no database or release app.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, '../ledGame-platform/package.json'))('playwright');
const output = path.join(root, '.build/red-20261028/preview-ui');
await mkdir(output, { recursive: true });
const launch = {};
if (process.env.LOCALAPPDATA) {
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
  if (chrome) launch.executablePath = path.join(cache, chrome, 'chrome-win64/chrome.exe');
}
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const passed = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  // Keep playback deterministic while verifying its real 25ms interval contract.
  const intervals = new Map();
  let nextInterval = -1;
  const nativeSet = window.setInterval.bind(window), nativeClear = window.clearInterval.bind(window);
  window.setInterval = (callback, delay, ...args) => {
    if (delay !== 25) return nativeSet(callback, delay, ...args);
    const id = nextInterval--;
    intervals.set(id, () => callback(...args));
    return id;
  };
  window.clearInterval = id => intervals.has(id) ? intervals.delete(id) : nativeClear(id);
  window.tickPreview = () => [...intervals.values()].forEach(callback => callback());
  window.previewIntervalCount = () => intervals.size;
  const points = Array.from({ length: 21 }, (_, index) => [index % 7, Math.floor(index / 7)]);
  const game = { id: 1, name: '格线预览测试', type: 'default', mode: '[1]',
    siteSizeWidth: 7, siteSizeHeight: 3, color0: '#00ff00', color1: '#0000ff', color2: '#f24c3d', color3: '#c080ff', commonConfig: {},
    levels: [{ label: '同色相邻格', frameList: [
      { repeatTimes: 3, matrix: [{ id: 'all-red', x: 0, y: 0, color: 2, points }] },
      { repeatTimes: 2, matrix: [{ id: 'last-blue', x: 6, y: 2, color: 1, points: [[0, 0]] }] },
    ] }] };
  window.fixture = { game, writes: 0 };
  window.appLanguage = { get: async () => 'zh-CN', set: async value => value, onChanged: () => () => {} };
  window.ledGame = {
    getGameEditor: async () => ({ data: structuredClone(game) }), listGameCategories: async () => ({ data: [] }),
    onEngineState: () => () => {}, onLedFrame: () => () => {},
    saveGameEditor: async () => { window.fixture.writes++; throw Error('Preview must not save'); },
    saveGif: async value => { window.fixture.gif = Array.from(value.bytes); return { fileName: 'fixture.gif' }; },
  };
  window.spiritLibrary = { list: async () => ({ data: [] }) };
});
const check = async (name, fn) => { await fn(); passed.push(name); console.log('通过：' + name); };
const canvas = page.locator('.simple-level-preview-canvas');
const canvasPixels = () => canvas.evaluate(element => {
  const snapshot = window.getComponentSetup().levelPreviewSnapshot;
  const context = element.getContext('2d'), size = element.width / snapshot.width;
  const pixel = (x, y) => [...context.getImageData(x, y, 1, 1).data].slice(0, 3);
  return { width: element.width, height: element.height, size,
    first: pixel(Math.floor(size / 2), Math.floor(size / 2)),
    last: pixel(element.width - Math.ceil(size / 2), element.height - Math.ceil(size / 2)),
    innerEdge: pixel(size, Math.floor(size / 2)),
    outer: [pixel(0, 0), pixel(element.width - 1, 0), pixel(0, element.height - 1), pixel(element.width - 1, element.height - 1)],
  };
});
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(() => window.mountComponent);
  await page.evaluate(() => window.mountComponent('SimpleGameEditorView', { gameId: 1 }));
  await page.waitForFunction(() => window.getComponentSetup()?.editorFitReady);
  await page.getByRole('button', { name: '打开预览', exact: true }).click();
  await canvas.waitFor();
  await page.waitForFunction(() => document.querySelector('.simple-level-preview-canvas').width > 7);

  await check('真实预览放大、同色格线、首末边界及原色', async () => {
    const result = await canvasPixels();
    assert.equal(result.width / result.height, 7 / 3);
    assert.deepEqual(result.first, [242, 76, 61]);
    assert.deepEqual(result.last, [242, 76, 61]);
    assert.deepEqual(result.innerEdge, [255, 255, 255]);
    assert.ok(result.outer.every(color => color.every(channel => channel === 255)));
    await page.screenshot({ path: path.join(output, 'same-color-grid.png') });
  });

  await check('25ms节拍、3/2次重复、帧顺序、循环、只读快照和关闭清理', async () => {
    assert.equal(await page.evaluate(() => window.previewIntervalCount()), 1);
    await page.evaluate(() => { window.getComponentSetup().activeFrame.matrix[0].color = 0; });
    for (let i = 0; i < 2; i++) await page.evaluate(() => window.tickPreview());
    assert.deepEqual((await canvasPixels()).last, [242, 76, 61]);
    await page.evaluate(() => window.tickPreview());
    assert.deepEqual((await canvasPixels()).first, [0, 0, 0]);
    assert.deepEqual((await canvasPixels()).last, [0, 0, 255]);
    assert.match(await page.locator('.simple-level-preview-dialog footer').innerText(), /2\s*\/\s*2/);
    await page.evaluate(() => window.tickPreview());
    assert.deepEqual((await canvasPixels()).last, [0, 0, 255]);
    await page.evaluate(() => window.tickPreview());
    assert.deepEqual((await canvasPixels()).last, [242, 76, 61]);
    assert.equal(await page.evaluate(() => window.fixture.writes), 0);
    await page.getByRole('button', { name: '关闭预览', exact: true }).click();
    assert.equal(await page.evaluate(() => window.previewIntervalCount()), 0);
  });

  await check('横向/纵向/单格与常用16×36矩阵在大小屏完整适配', async () => {
    for (const [screenWidth, screenHeight] of [[1024, 600], [1920, 1080]]) {
      await page.setViewportSize({ width: screenWidth, height: screenHeight });
      for (const [width, height] of [[7, 3], [3, 7], [1, 1], [16, 36]]) {
        await page.evaluate(([width, height]) => {
          window.getComponentSetup().levelPreviewSnapshot = { width, height, colors: ['#123456'], label: `${width}×${height}`,
            frames: [{ repeatTimes: 1, matrix: [{ x: 0, y: 0, color: 0, points: Array.from({ length: width * height }, (_, i) => [i % width, Math.floor(i / width)]) }] }] };
        }, [width, height]);
        await page.waitForFunction(([width, height]) => {
          const element = document.querySelector('.simple-level-preview-canvas');
          return element && Math.abs(element.width / element.height - width / height) < 0.0001;
        }, [width, height]);
        await page.waitForTimeout(60);
        const result = await canvasPixels();
        assert.deepEqual(result.first, [18, 52, 86]); assert.deepEqual(result.last, [18, 52, 86]);
        assert.ok(result.outer.every(color => color.every(channel => channel === 255)));
        const bounds = await canvas.boundingBox(), dialog = await page.locator('.simple-level-preview-dialog').boundingBox();
        assert.ok(bounds.x >= dialog.x && bounds.x + bounds.width <= dialog.x + dialog.width + 1);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= screenHeight);
        assert.ok(Math.abs(bounds.width / bounds.height - width / height) < 0.01);
        await page.screenshot({ path: path.join(output, `${width}x${height}-${screenWidth}.png`) });
      }
    }
    await page.evaluate(() => window.getComponentSetup().closeLevelPreview());
  });

  await check('GIF文件图标与JSON导入导出及对象编辑工具清楚区分', async () => {
    await page.evaluate(async () => {
      const { createApp, h } = await import('/node_modules/.vite/deps/vue.js');
      const { default: Icon } = await import('/src/components/EditorActionIcon.vue');
      const host = document.createElement('div'); host.id = 'icon-gallery';
      host.style.cssText = 'position:fixed;inset:40px auto auto 40px;z-index:9999;display:flex;gap:24px;padding:24px;background:#202838;color:#fff';
      document.body.append(host);
      createApp({ render: () => ['gif', 'import', 'export', 'add', 'delete', 'brush', 'region', 'select'].map(name => h('div', { 'data-icon': name }, [h(Icon, { name }), h('span', name)])) }).mount(host);
    });
    const gallery = page.locator('#icon-gallery');
    assert.equal(await gallery.locator('[data-icon="gif"] svg text').textContent(), 'GIF');
    const shapes = await gallery.locator('svg').evaluateAll(nodes => nodes.map(node => node.innerHTML));
    assert.equal(new Set(shapes).size, 8);
    assert.equal(await gallery.locator('svg[aria-hidden="true"]').count(), 8);
    await page.screenshot({ path: path.join(output, 'distinct-icons.png') });
  });
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') });
  throw error;
} finally {
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed, errors }, null, 2));
  await browser.close();
  await server.close();
}
