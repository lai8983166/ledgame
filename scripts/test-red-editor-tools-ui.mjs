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
const output = path.join(root, '.build/client-feedback-20261029/editor-tools-ui');
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
    undo: s.rgbEditHistory.undoCount, redo: s.rgbEditHistory.redoCount, tool: s.drawingTool, mode: s.editingMode };
});
const setup = matrix => page.evaluate(matrix => {
  const s = window.getComponentSetup();
  s.activeFrame.matrix = matrix; s.invalidateMatrixFrame(); s.clearRgbEditHistory(); s.selectedObjectId = '';
}, matrix);
const tool = name => page.locator(`[data-tool="${name}"]`).click();
const mode = name => page.locator(`[data-edit-mode="${name}"]`).click();
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
  await check('选择/添加/删除互斥，单点/区域互斥，提示与Alt快捷键受输入和弹窗保护', async () => {
    assert.equal(await page.locator('[data-tool]').count(), 3);
    assert.equal(await page.locator('[data-edit-mode]').count(), 2);
    assert.equal(await page.locator('[data-tool="select"]').getAttribute('data-tip'), '选择对象');
    for (const [name, shortcut] of [['add', 'Alt+A'], ['delete', 'Alt+D']]) {
      assert.match(await page.locator(`[data-tool="${name}"]`).getAttribute('data-tip'), new RegExp(shortcut.replace('+', '\\+')));
      assert.equal(await page.locator(`[data-tool="${name}"]`).getAttribute('aria-keyshortcuts'), shortcut);
    }
    assert.equal(await page.locator('[data-edit-mode="point"]').isDisabled(), true);
    await page.keyboard.press('Alt+a');
    assert.equal((await read()).tool, 'add'); assert.equal((await read()).mode, 'point');
    assert.equal(await page.locator('[data-tool][aria-pressed="true"]').count(), 1);
    assert.equal(await page.locator('[data-edit-mode][aria-pressed="true"]').count(), 1);
    await mode('region'); await page.keyboard.press('Alt+d');
    assert.equal((await read()).tool, 'delete'); assert.equal((await read()).mode, 'region');
    assert.equal(await page.locator('[data-tool][aria-pressed="true"]').count(), 1);
    assert.equal(await page.locator('[data-edit-mode][aria-pressed="true"]').count(), 1);
    const search = page.locator('.sprite-dimension-search');
    await search.focus(); await page.keyboard.press('Alt+a'); assert.equal((await read()).tool, 'delete');
    await search.blur();
    await page.evaluate(() => window.getComponentSetup().globalConfigOpen = true);
    await page.keyboard.press('Alt+a'); assert.equal((await read()).tool, 'delete');
    await page.locator('.global-config-dialog').getByRole('button', { name: '取消', exact: true }).click();
    await page.evaluate(() => {
      const dialog = document.createElement('div');
      dialog.id = 'parent-modal-fixture'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
      dialog.textContent = 'Modal'; document.body.append(dialog);
    });
    await page.keyboard.press('Alt+a'); assert.equal((await read()).tool, 'delete');
    await page.evaluate(() => document.querySelector('#parent-modal-fixture').remove());
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', altKey: true, repeat: true })));
    assert.equal((await read()).tool, 'delete');
    const frame = await page.evaluate(() => window.getComponentSetup().activeFrameIndex);
    await page.keyboard.press('d'); assert.equal(await page.evaluate(() => window.getComponentSetup().activeFrameIndex), frame + 1);
    await page.keyboard.press('a'); assert.equal(await page.evaluate(() => window.getComponentSetup().activeFrameIndex), frame);
    await tool('select'); assert.equal(await page.locator('[data-edit-mode][aria-pressed="true"]').count(), 0);
  });
  await check('添加单点仅点击创建，异色可叠层同色不重复，拖动不生成对象', async () => {
    await setup([{ id: 'other', x: 2, y: 2, color: 1, points: [[0, 0]] }]);
    await page.locator('.object-color-2').click(); await mode('point');
    assert.equal((await read()).tool, 'add');
    await click(2, 2); assert.equal((await read()).matrix.length, 2); assert.equal((await read()).undo, 1);
    await click(2, 2); assert.equal((await read()).matrix.length, 2); assert.equal((await read()).undo, 1);
    const before = (await read()).matrix;
    await drag([4, 4], [5, 5]); assert.deepEqual((await read()).matrix, before); assert.equal((await read()).undo, 1);
    assert.match(await page.locator('.matrix-overlay-canvas').evaluate(el => el.style.cursor), /data:image\/svg/);
    await page.keyboard.press('Control+z'); assert.equal((await read()).matrix.length, 1);
    await click(2, 2); assert.equal((await read()).matrix.length, 2);
  });
  await check('单点可连续点击添加精灵，精灵拖动不创建也不移动对象', async () => {
    await setup([]); await tool('add'); await mode('point');
    await page.locator('.sprite-preview-card').first().click();
    assert.equal((await read()).tool, 'add');
    await click(3, 3); await click(7, 7); assert.equal((await read()).matrix.length, 2);
    assert.equal((await read()).matrix[0].points.length, 2);
    const before = (await read()).matrix;
    await drag([3, 3], [4, 4]); assert.deepEqual((await read()).matrix, before);
  });
  await check('添加区域拖框生成单个多点对象、一次撤销，精灵禁用且不使用遗留精灵', async () => {
    await setup([]); await mode('region');
    assert.equal(await page.evaluate(() => window.getComponentSetup().spriteBrushActive), false);
    assert.equal(await page.locator('.sprite-preview-card').first().isDisabled(), true);
    await page.evaluate(() => { const s = window.getComponentSetup(); s.selectEditorSprite(s.filteredEditorSprites[0]); });
    assert.equal(await page.evaluate(() => window.getComponentSetup().spriteBrushActive), false);
    await page.locator('.object-color-1').click();
    await drag([4, 4], [5, 5]); assert.equal((await read()).matrix.length, 1);
    assert.equal((await read()).matrix[0].points.length, 4); assert.equal((await read()).matrix[0].color, 1);
    assert.equal((await read()).undo, 1); await page.keyboard.press('Control+z'); assert.deepEqual((await read()).matrix, []);
    await page.keyboard.press('Control+y'); assert.equal((await read()).matrix[0].points.length, 4);
    await click(8, 8); assert.equal((await read()).matrix.at(-1).points.length, 1);
    await page.screenshot({ path: path.join(output, '添加区域.png') });
  });
  await check('删除单点仅去掉渲染最上层一点，保留同对象其它点、下层及元数据，可逐层点击且空格无历史', async () => {
    const original = [
      { id: 'under', x: 3, y: 3, color: 2, points: [[0, 0]], metadata: 'untouched' },
      { id: 'green-top', x: 3, y: 3, color: 0, points: [[0, 0], [2, 0]], metadata: { keep: true } },
      { id: 'last-but-not-top', x: 3, y: 3, color: 1, points: [[0, 0]] },
    ];
    await setup(original); await tool('delete'); await mode('point');
    await click(3, 3);
    const after = [original[0], { ...original[1], points: [[2, 0]] }, original[2]];
    assert.deepEqual((await read()).matrix, after); assert.equal((await read()).undo, 1);
    await click(10, 10); assert.equal((await read()).undo, 1);
    await page.keyboard.press('Control+z'); assert.deepEqual((await read()).matrix, original);
    await click(10, 10); assert.equal((await read()).redo, 1, '空操作保留重做');
    await page.keyboard.press('Control+y'); assert.deepEqual((await read()).matrix, after);
    await click(3, 3); assert.deepEqual((await read()).matrix, after.slice(0, 2));
    await click(3, 3); assert.deepEqual((await read()).matrix, [after[1]]);
    await click(5, 3); assert.deepEqual((await read()).matrix, []);
    await page.keyboard.press('Control+z'); assert.deepEqual((await read()).matrix, [after[1]]);
    await setup(original); await drag([3, 3], [5, 3]); assert.deepEqual((await read()).matrix, original);
    assert.equal((await read()).undo, 0, '单点删除不支持拖动擦除');
  });
  await check('删除单点可局部修改精灵对象，余点和ID不变，撤销恢复', async () => {
    await setup([]); await tool('add'); await mode('point');
    await page.locator('.sprite-preview-card').first().click(); await click(3, 3);
    const original = (await read()).matrix;
    await tool('delete'); await click(3, 3);
    assert.equal((await read()).matrix.length, 1); assert.equal((await read()).matrix[0].id, original[0].id);
    assert.equal((await read()).matrix[0].points.length, 1);
    await page.keyboard.press('Control+z'); assert.deepEqual((await read()).matrix, original);
  });
  await check('删除区域移除所有相交整对象含下层和框外点，未相交对象保留，一次撤销重做', async () => {
    const original = [
      { id: 'under', x: 3, y: 3, color: 1, points: [[0, 0], [5, 0]], metadata: 'outside-point' },
      { id: 'green-top', x: 3, y: 3, color: 0, points: [[0, 0], [0, 5]] },
      { id: 'survivor', x: 6, y: 6, color: 2, points: [[-1, 0], [1, 0]], metadata: 'same' },
      { id: 'hole', x: 3, y: 3, color: 2, points: [[-1, -1], [2, 2]], metadata: 'bbox-only' },
    ];
    await setup(original); await tool('delete'); await mode('region');
    await drag([3, 3], [4, 4], { release: false });
    assert.deepEqual((await read()).matrix, original); assert.equal((await read()).undo, 0);
    await page.mouse.up(); assert.deepEqual((await read()).matrix, original.slice(2)); assert.equal((await read()).undo, 1);
    await page.keyboard.press('Control+z'); assert.deepEqual((await read()).matrix, original);
    await page.keyboard.press('Control+Shift+z'); assert.deepEqual((await read()).matrix, original.slice(2));
    await click(10, 10); assert.equal((await read()).undo, 1);
    await page.screenshot({ path: path.join(output, '删除区域.png') });
  });
  await check('添加/删除区域和对象拖动在取消、失焦、失捕获、切工具/模式/帧/关及Escape后不提交', async () => {
    const original = [{ id: 'retain', x: 3, y: 3, color: 2, points: [[0, 0], [1, 0]], extra: 'stable' }];
    const interrupts = ['pointercancel', 'blur', 'capture', 'tool', 'mode', 'color', 'sprite', 'shortcut', 'frame', 'level', 'escape'];
    for (const operation of ['select', 'add', 'delete']) {
      for (const interrupt of interrupts) {
        if (interrupt === 'mode' && operation === 'select') continue;
        await setup(original); await tool(operation);
        if (operation !== 'select') await mode('region');
        await drag([3, 3], [6, 5], { release: false });
        if (interrupt === 'pointercancel') await page.locator('.matrix-overlay-canvas').dispatchEvent('pointercancel', { pointerId: 1 });
        if (interrupt === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        if (interrupt === 'capture') await page.locator('.matrix-overlay-canvas').evaluate(el => el.releasePointerCapture(1));
        if (interrupt === 'tool') await page.evaluate(() => window.getComponentSetup().selectDrawingTool('add'));
        if (interrupt === 'mode') await page.evaluate(() => window.getComponentSetup().selectEditingMode('point'));
        if (interrupt === 'color') await page.evaluate(() => window.getComponentSetup().selectColor(1));
        if (interrupt === 'sprite') await page.evaluate(() => {
          const s = window.getComponentSetup();
          if (s.drawingTool !== 'select') s.selectEditingMode('point');
          else s.editingMode = 'point';
          s.selectEditorSprite(s.filteredEditorSprites[0]);
        });
        if (interrupt === 'shortcut') await page.keyboard.press('Alt+a');
        if (interrupt === 'frame') await page.evaluate(() => window.getComponentSetup().selectFrame(1));
        if (interrupt === 'level') await page.evaluate(() => window.getComponentSetup().selectLevel(1));
        if (interrupt === 'escape') await page.keyboard.press('Escape');
        await page.mouse.up();
        if (interrupt === 'frame') await page.evaluate(() => window.getComponentSetup().selectFrame(0));
        if (interrupt === 'level') await page.evaluate(() => window.getComponentSetup().selectLevel(0));
        assert.deepEqual((await read()).matrix, original, `${operation}/${interrupt}`);
        assert.equal((await read()).undo, 0, `${operation}/${interrupt}`);
      }
    }
    await page.locator('.object-color-1').click(); await mode('point'); await click(8, 8);
    assert.equal((await read()).matrix.length, 2); assert.equal((await read()).undo, 1);
  });
  assert.deepEqual(failures, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed, failures }, null, 2));
} finally {
  await browser.close(); await new Promise(resolve => httpServer.close(resolve)); await server.close();
}
