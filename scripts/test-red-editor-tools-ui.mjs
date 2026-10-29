import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, '../ledGame-platform/package.json'))('playwright');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/red-20261028/editor-tools-ui');
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { middlewareMode: true, hmr: false } });
const httpServer = createHttpServer(server.middlewares);
await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const failures = [], passed = [];
page.on('pageerror', error => failures.push(error.message));
await page.addInitScript(() => {
  window.appLanguage = { get: async () => 'zh-CN', set: async v => v, onChanged: () => () => {} };
  const game = { id: 1, name: '隔离工具验证', type: 'default', siteSizeWidth: 12, siteSizeHeight: 12,
    commonConfig: {}, gif: {}, levels: [0, 1].map(index => ({ label: `关卡${index + 1}`, option: {}, frameList: [0, 1].map(() => ({ repeatTimes: 1, matrix: [] })) })) };
  window.ledGame = { getGameEditor: async () => ({ data: structuredClone(game) }),
    listGameCategories: async () => ({ data: [] }), restoreFocus: async () => {} };
  window.spiritLibrary = { list: async () => ({ data: [{ id: 99, name: 'Double', color: 2, width: 2, height: 2, points: [[0, 0], [1, 1]] }] }) };
});
const read = () => page.evaluate(() => {
  const s = window.getComponentSetup();
  return { matrix: structuredClone(JSON.parse(JSON.stringify(s.activeFrame.matrix))), selected: s.selectedObjectId,
    undo: s.rgbEditHistory.undoCount, redo: s.rgbEditHistory.redoCount, tool: s.drawingTool };
});
const setup = matrix => page.evaluate(matrix => {
  const s = window.getComponentSetup();
  s.activeFrame.matrix = matrix; s.invalidateMatrixFrame(); s.clearRgbEditHistory(); s.selectedObjectId = '';
}, matrix);
const tool = name => page.locator(`[data-tool="${name}"]`).click();
async function point(x, y) {
  return page.evaluate(({ x, y }) => {
    const s = window.getComponentSetup(), canvas = window.document.querySelector('.matrix-overlay-canvas'), rect = canvas.getBoundingClientRect();
    const cells = s.matrixCells, first = cells[0], stride = s.matrixCellSizeValue + s.matrixGapSizeValue;
    const pad = s.panoramaMode ? 0 : 2;
    return { x: rect.x + ((x - first.x + pad) * stride + s.matrixCellSizeValue / 2) * rect.width / parseFloat(canvas.style.width),
      y: rect.y + ((y - first.y + pad) * stride + s.matrixCellSizeValue / 2) * rect.height / parseFloat(canvas.style.height) };
  }, { x, y });
}
async function click(x, y) { const p = await point(x, y); await page.mouse.click(p.x, p.y); }
async function drag(start, end, { release = true } = {}) {
  const a = await point(...start), b = await point(...end);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 1 });
  if (release) await page.mouse.up();
}
async function check(name, run) { await run(); passed.push(name); console.log('通过：' + name); }
try {
  await page.goto(`http://127.0.0.1:${httpServer.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(() => window.mountComponent);
  await page.evaluate(() => window.mountComponent('SimpleGameEditorView', { gameId: 1 }));
  await page.waitForFunction(() => window.getComponentSetup()?.editorFitReady);
  await check('选择工具空白不画，选中和拖动只改对象，撤销恢复', async () => {
    assert.equal((await read()).tool, 'select');
    await click(2, 2); assert.deepEqual((await read()).matrix, []);
    await setup([{ id: 'origin', x: 3, y: 3, color: 2, points: [[0, 0], [1, 0]] }]);
    await click(3, 3); assert.equal((await read()).selected, 'origin'); assert.equal((await read()).undo, 0);
    assert.equal(await page.locator('.matrix-overlay-canvas').evaluate(el => el.style.cursor), 'grab');
    await drag([3, 3], [5, 4]); assert.equal((await read()).undo, 1);
    assert.deepEqual((await read()).matrix[0].points, [[0, 0], [1, 0]]);
    await page.keyboard.press('Control+z'); assert.equal((await read()).matrix[0].x, 3);
  });
  await check('画笔在异色上叠画，同色不重叠，拖框创建和一次撤销', async () => {
    await setup([{ id: 'other', x: 2, y: 2, color: 1, points: [[0, 0]] }]);
    await page.locator('.object-color-2').click(); assert.equal((await read()).tool, 'brush');
    await click(2, 2); assert.equal((await read()).matrix.length, 2); assert.equal((await read()).undo, 1);
    await click(2, 2); assert.equal((await read()).matrix.length, 2); assert.equal((await read()).undo, 1);
    const before = (await read()).matrix;
    await drag([4, 4], [5, 5]); assert.equal((await read()).matrix.at(-1).points.length, 4); assert.equal((await read()).undo, 2);
    await page.keyboard.press('Control+z'); assert.deepEqual((await read()).matrix, before);
    assert.match(await page.locator('.matrix-overlay-canvas').evaluate(el => el.style.cursor), /data:image\/svg/);
    await tool('select'); await click(8, 8); assert.deepEqual((await read()).matrix, before);
  });
  await check('精灵选择自动进入画笔，连续放置，不拖动已有对象', async () => {
    await setup([]);
    await page.evaluate(() => { const s = window.getComponentSetup(); s.selectEditorSprite(s.filteredEditorSprites[0]); });
    assert.equal((await read()).tool, 'brush');
    await click(3, 3); await click(7, 7); assert.equal((await read()).matrix.length, 2);
    assert.equal((await read()).matrix[0].points.length, 2);
    await drag([3, 3], [4, 4]); assert.equal((await read()).matrix.length, 2);
    await page.screenshot({ path: path.join(output, 'tools.png') });
  });
  await check('画笔和拖动在取消、失焦、切工具及切帧后不提交残留操作', async () => {
    const original = [{ id: 'stable', x: 3, y: 3, color: 2, points: [[0, 0], [1, 0]] }];
    for (const interrupt of ['pointercancel', 'blur', 'tool', 'frame']) {
      await setup(original); await tool('select');
      await drag([3, 3], [6, 5], { release: false });
      if (interrupt === 'pointercancel') await page.locator('.matrix-overlay-canvas').dispatchEvent('pointercancel', { pointerId: 1 });
      if (interrupt === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      if (interrupt === 'tool') await page.evaluate(() => window.getComponentSetup().selectDrawingTool('brush'));
      if (interrupt === 'frame') await page.evaluate(() => window.getComponentSetup().selectFrame(1));
      await page.mouse.up();
      if (interrupt === 'frame') await page.evaluate(() => window.getComponentSetup().selectFrame(0));
      assert.deepEqual((await read()).matrix, original, interrupt); assert.equal((await read()).undo, 0, interrupt);
    }
    await page.locator('.object-color-2').click();
    await drag([7, 7], [9, 9], { release: false });
    await page.locator('.matrix-overlay-canvas').dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
    assert.deepEqual((await read()).matrix, original); assert.equal((await read()).undo, 0);
  });
  await check('橡皮碰一个点删除整个对象，点击只擦顶部层，空格无历史', async () => {
    const original = [
      { id: 'under', x: 3, y: 3, color: 2, points: [[0, 0]], metadata: 'untouched' },
      { id: 'green-top', x: 3, y: 3, color: 0, points: [[0, 0], [2, 0]] },
      { id: 'last-but-not-top', x: 3, y: 3, color: 1, points: [[0, 0]] },
    ];
    await setup(original); await tool('eraser');
    await click(3, 3);
    assert.deepEqual((await read()).matrix, [original[0], original[2]]); assert.equal((await read()).undo, 1);
    await click(10, 10); assert.equal((await read()).undo, 1);
    await page.keyboard.press('Control+z'); assert.deepEqual((await read()).matrix, original);
    await page.keyboard.press('Control+y'); assert.deepEqual((await read()).matrix, [original[0], original[2]]);
    await click(3, 3); assert.deepEqual((await read()).matrix, [original[0]]);
  });
  await check('橡皮快速连续跨格预览，整次仅一步历史，撤销保留奇偶锚点/ID/点和元数据', async () => {
    const original = [
      { id: 'even', x: 3, y: 3, color: 2, points: [[-1, 0], [0, 0]], extra: { note: 'even' } },
      { id: 'odd', x: 6, y: 3, color: 1, points: [[-1, -1], [0, 0], [1, 1]], extra: 'odd' },
      { id: 'survivor', x: 10, y: 8, color: 2, points: [[-2, 0], [0, 0]], extra: 'anchor-unchanged' },
    ];
    await setup(original); await tool('eraser');
    await drag([1, 3], [8, 3], { release: false });
    assert.deepEqual((await read()).matrix, original); assert.equal((await read()).undo, 0);
    assert.deepEqual(await page.evaluate(() => window.getComponentSetup().erasePreviewFrame.matrix.map(o => o.id)), ['survivor']);
    await page.mouse.up();
    assert.deepEqual((await read()).matrix, [original[2]]); assert.equal((await read()).undo, 1);
    await page.keyboard.press('Control+z'); assert.deepEqual((await read()).matrix, original); assert.equal((await read()).undo, 0);
    await page.keyboard.press('Control+Shift+z'); assert.deepEqual((await read()).matrix, [original[2]]);
    await page.screenshot({ path: path.join(output, 'eraser.png') });
  });
  await check('橡皮取消/失焦/失捕获/切工具/切帧/切关/Escape均无提交，后续仍能绘制', async () => {
    const original = [{ id: 'retain', x: 3, y: 3, color: 2, points: [[0, 0], [1, 0]], extra: 'stable' }];
    for (const interrupt of ['pointercancel', 'blur', 'capture', 'tool', 'frame', 'level', 'escape']) {
      await setup(original); await tool('eraser'); await drag([3, 3], [5, 3], { release: false });
      if (interrupt === 'pointercancel') await page.locator('.matrix-overlay-canvas').dispatchEvent('pointercancel', { pointerId: 1 });
      if (interrupt === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      if (interrupt === 'capture') await page.locator('.matrix-overlay-canvas').evaluate(el => el.releasePointerCapture(1));
      if (interrupt === 'tool') await page.evaluate(() => window.getComponentSetup().selectDrawingTool('brush'));
      if (interrupt === 'frame') await page.evaluate(() => window.getComponentSetup().selectFrame(1));
      if (interrupt === 'level') await page.evaluate(() => window.getComponentSetup().selectLevel(1));
      if (interrupt === 'escape') await page.keyboard.press('Escape');
      await page.mouse.up();
      if (interrupt === 'frame') await page.evaluate(() => window.getComponentSetup().selectFrame(0));
      if (interrupt === 'level') await page.evaluate(() => window.getComponentSetup().selectLevel(0));
      assert.deepEqual((await read()).matrix, original, interrupt); assert.equal((await read()).undo, 0, interrupt);
      assert.equal(await page.evaluate(() => window.getComponentSetup().erasePreviewFrame), null);
    }
    await page.locator('.object-color-1').click(); await click(8, 8); assert.equal((await read()).matrix.length, 2);
    assert.equal((await read()).undo, 1);
  });
  await check('橡皮离开画布抬起不重复擦起点，离开再进入不横穿未碰区域', async () => {
    const original = [
      { id: 'under', x: 2, y: 3, color: 1, points: [[0, 0]] },
      { id: 'top', x: 2, y: 3, color: 0, points: [[0, 0]] },
      { id: 'middle', x: 4, y: 3, color: 2, points: [[0, 0]] },
      { id: 'end', x: 6, y: 3, color: 2, points: [[0, 0]] },
    ];
    await setup(original); await tool('eraser');
    const start = await point(2, 3);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(0, 0); await page.mouse.up();
    assert.deepEqual((await read()).matrix, [original[0], original[2], original[3]]);
    await page.keyboard.press('Control+z');
    await click(10, 10); assert.equal((await read()).redo, 1, 'empty erasing retains redo');
    const end = await point(6, 3);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(0, 0);
    await page.mouse.move(end.x, end.y); await page.mouse.up();
    assert.deepEqual((await read()).matrix, [original[0], original[2]]); assert.equal((await read()).undo, 1);
  });
  assert.deepEqual(failures, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed, failures }, null, 2));
} finally {
  await browser.close(); await new Promise(resolve => httpServer.close(resolve)); await server.close();
}
