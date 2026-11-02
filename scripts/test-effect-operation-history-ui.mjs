// Actual Vue editor with isolated memory IPC. Never reads or writes the daily DB.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer as createHttpServer } from 'node:http';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { applyEffectToFrameList, expandEffectFrames } from '../src/lib/effectEditor.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium, expect } = createRequire(path.join(root, '../ledGame-platform/package.json'))('@playwright/test');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/effect-operation-history-ui');
await mkdir(output, { recursive: true });
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false } });
const server = createHttpServer(vite.middlewares);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.setDefaultTimeout(15000);
const passed = [], errors = [];
let acceptEffectImpact = true;
const impactPrompts = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog',dialog=>{impactPrompts.push(dialog.message());return acceptEffectImpact?dialog.accept():dialog.dismiss();});
await page.addInitScript(() => {
  const frame = index => ({ repeatTimes: index + 2, frameMetadata: { voice: `frame-${index}.wav`, flags: [index, false] },
    matrix: [{ id: `old-${index}`, x: index, y: 4, color: 0, points: [[0, 0]],
      objectMetadata: { spriteId: 'custom', tags: [index, 'preserve'] } }] });
  window.fixture = {
    game: { id: 1, name: '特效撤销隔离测试', type: 'default', mode: '[1]', siteSizeWidth: 8, siteSizeHeight: 8,
      commonConfig: { keep: { nested: true } }, audio: { voice: 'global.wav' },
      levels: [0, 1].map(index => ({ label: `Level ${index}`, option: { scoreMode: 'none' },
        customLevelMetadata: { keep: index }, frameList: Array.from({ length: 5 }, (_, index) => frame(index)) })) },
    writes: 0,
  };
  window.appLanguage = { get: async () => 'zh-CN', onChanged: () => () => {} };
  window.ledGame = {
    getGameEditor: async () => ({ data: structuredClone(window.fixture.game) }),
    listGameCategories: async () => ({ data: [] }),
    saveGameEditor: async () => { window.fixture.writes++; throw Error('Unexpected write'); },
  };
  window.spiritLibrary = { list: async () => ({ data: [] }) };
});
const evaluate = (fn, arg) => page.evaluate(fn, arg);
const state = () => evaluate(() => {
  const s = window.getComponentSetup();
  return JSON.parse(JSON.stringify({ document: s.document, level: s.activeLevelIndex, frame: s.activeFrameIndex,
    selected: s.selectedObjectId, undo: s.rgbEditHistory.undoCount, redo: s.rgbEditHistory.redoCount }));
});
const content = value => ({ document: value.document, level: value.level, frame: value.frame, selected: value.selected });
const button = name => page.getByRole('button', { name, exact: true });
const undo = async () => { await button('撤销 RGB 编辑').click(); };
const redo = async () => { await button('重做 RGB 编辑').click(); };
const mount = async mode => {
  await evaluate(mode => { window.fixture.game.mode = mode; window.mountComponent('SimpleGameEditorView', { gameId: 1 }); }, mode);
  await page.waitForFunction(() => window.getComponentSetup()?.editorFitReady);
};
const config = mode => ({ color: 2, startX: 1, startY: 1, endX: 3, endY: 1,
  width: 1, height: 1, step: 1, mode, useSprite: false, spriteId: '' });
const apply = async mode => {
  await button('特效').click();
  if (mode === 'merge') {
    // Merge remains a compatibility path, deliberately absent from the dialog.
    await evaluate(config => window.getComponentSetup().applyEffectResult({ config, frames: [{}] }), config(mode));
  } else {
    const dialog = page.locator('.game-effect-dialog');
    await dialog.locator('select').first().selectOption(mode);
    await dialog.locator('.game-effect-color-options input').nth(2).check();
    await dialog.locator('label').filter({ has: page.locator('span').filter({ hasText: /^终点 X/ }) }).locator('input').fill('3');
    await dialog.locator('.game-effect-actions .primary').click();
  }
  await expect(page.locator('.game-effect-dialog')).toHaveCount(0);
};
const check = async (name, run) => { await run(); passed.push(name); console.log('PASS ' + name); };

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(() => window.mountComponent);
  for (const gameMode of ['[1]', '[2]', '[3]']) {
    for (const effectMode of ['insert', 'after', 'overwrite', 'merge']) {
      for (const start of (gameMode === '[3]' ? [1, 4] : [gameMode === '[2]' ? 4 : 1])) {
        await check(`${gameMode} ${effectMode} at ${start}: one whole effect, complete data/selection, RGB interleaving`, async () => {
          await mount(gameMode);
          // A preceding edit in another level must survive the frame structure change.
          await evaluate(() => { const s = window.getComponentSetup(); s.selectedObjectId = 'old-0'; });
          const original = await state();
          await evaluate(() => window.getComponentSetup().moveSelectedObject(1, 0));
          const preceding = await state();
          await evaluate(start => {
            const s = window.getComponentSetup(); s.selectLevel(1); s.selectFrame(start); s.selectedObjectId = `old-${start}`;
          }, start);
          const before = await state();
          await apply(effectMode);
          const after = await state();
          assert.equal(after.undo, 2, 'effect must add exactly one entry and retain the earlier edit');
          const prefix = await evaluate(() => window.getComponentSetup().effectIdPrefix);
          const expected = applyEffectToFrameList(before.document.levels[1].frameList, start,
            expandEffectFrames(config(effectMode), { idPrefix: prefix }), effectMode);
          assert.deepEqual(after.document.levels[1].frameList, expected.frameList);
          assert.equal(after.frame, expected.selectedFrameIndex);
          assert.equal(after.level, 1);
          assert.equal(after.selected, '');
          const expectedDocument = structuredClone(before.document);
          expectedDocument.levels[1].frameList = expected.frameList;
          assert.deepEqual(after.document, expectedDocument, 'global settings, other levels and complete untouched frames survive');
          // Select the generated object and perform a later RGB edit.
          await evaluate(() => { const s = window.getComponentSetup(); s.selectedObjectId = s.activeFrame.matrix.at(-1).id; });
          const beforeLater = await state();
          await evaluate(() => window.getComponentSetup().moveSelectedObject(0, 1));
          const later = await state();
          assert.equal(later.undo, 3);
          await undo(); assert.deepEqual(content(await state()), content(beforeLater));
          await undo(); assert.deepEqual(content(await state()), content(before));
          assert.equal((await state()).undo, 1);
          await undo(); assert.deepEqual(content(await state()), content(original));
          await redo(); assert.deepEqual(content(await state()), content(preceding));
          await redo(); assert.deepEqual(content(await state()), content(after));
          await redo(); assert.deepEqual(content(await state()), content(later));
          // New real RGB edits invalidate the redo branch after undoing a whole effect.
          await undo(); await undo();
          await evaluate(() => window.getComponentSetup().moveSelectedObject(0, -1));
          assert.equal((await state()).redo, 0);
          await expect(button('重做 RGB 编辑')).toBeDisabled();
        });
      }
    }
  }

  await check('preceding RGB edit in the same frame survives index shifts and restores in order',async()=>{
    await mount('[1]');
    await evaluate(()=>{const s=window.getComponentSetup();s.selectFrame(2);s.selectedObjectId='old-2';});
    const original=await state();
    await evaluate(()=>window.getComponentSetup().moveSelectedObject(1,0));
    const moved=await state();
    await apply('insert');const effected=await state();
    assert.equal(effected.document.levels[0].frameList[5].matrix[0].id,'old-2');
    assert.equal(effected.document.levels[0].frameList[5].matrix[0].x,3);
    await undo();assert.deepEqual(content(await state()),content(moved));
    await undo();assert.deepEqual(content(await state()),content(original));
    await redo();assert.deepEqual(content(await state()),content(moved));
    await redo();assert.deepEqual(content(await state()),content(effected));
  });

  await check('preview count and cancel/accept impact confirmation preserve the single-operation history',async()=>{
    await mount('[1]');await evaluate(()=>window.getComponentSetup().selectFrame(4));
    await apply('insert');await undo();const before=await state();
    await button('特效').click();const dialog=page.locator('.game-effect-dialog');
    await dialog.locator('select').first().selectOption('overwrite');
    await dialog.locator('label').filter({has:page.locator('span').filter({hasText:/^终点 X/})}).locator('input').fill('3');
    await expect(dialog.locator('.game-effect-generated-count')).toHaveText('将生成 3 帧');
    const positions=await dialog.locator('.game-effect-preview-meta').evaluate(node=>[...node.children].map(child=>{const r=child.getBoundingClientRect();return{x:r.x,right:r.right};}));
    assert.ok(positions[1].x>=positions[0].right,'generation count is to the right of the progress');
    acceptEffectImpact=false;
    await dialog.locator('.game-effect-actions .primary').click();
    assert.match(impactPrompts.at(-1),/生成 3 帧，写入第 5～7 帧/);
    assert.match(impactPrompts.at(-1),/改动原有 1 帧，新增 2 帧/);
    assert.match(impactPrompts.at(-1),/5 → 7/);
    await expect(dialog).toBeVisible();assert.deepEqual(await state(),before);
    acceptEffectImpact=true;await dialog.locator('.game-effect-actions .primary').click();
    await expect(dialog).toHaveCount(0);assert.equal((await state()).undo,1);assert.equal((await state()).redo,0);
    assert.equal((await state()).document.levels[0].frameList.length,7);
    await undo();assert.deepEqual(content(await state()),content(before));
    await redo();assert.equal((await state()).document.levels[0].frameList.length,7);
  });

  await check('cancel, invalid, empty, rejected merge, no-op and busy effects preserve frames and redo', async () => {
    await mount('[1]');
    await evaluate(() => window.getComponentSetup().selectFrame(1));
    await apply('overwrite');
    // Keep the same effect prefix for a genuinely identical overwrite.
    await evaluate(() => {
      const s = window.getComponentSetup(); s.selectFrame(1); s.selectedObjectId = s.activeFrame.matrix[0].id;
      s.moveSelectedObject(0, 1); s.undoRgbEdit();
    });
    const before = await state();
    const promptsBeforeInvalid=impactPrompts.length;
    for (const input of [
      { config: config('overwrite'), frames: [{}] }, // identical overwrite
      { config: config('merge'), frames: [{}] }, // same-color collision
      { config: { ...config('insert'), step: 0 }, frames: [{}] },
      { config: { ...config('insert'), endX: 99 }, frames: [{}] },
      { config: { ...config('insert'), useSprite: true, spriteId: 'missing' }, frames: [{}] },
      { config: config('after'), frames: [] },
      null,
    ]) {
      await evaluate(input => window.getComponentSetup().applyEffectResult(input), input);
      assert.deepEqual(await state(), before);
    }
    await evaluate(input => { const s = window.getComponentSetup(); s.busyAction = 'save'; s.applyEffectResult(input); s.busyAction = ''; },
      { config: config('insert'), frames: [{}] });
    assert.deepEqual(await state(), before);
    await button('特效').click();
    const dialog = page.locator('.game-effect-dialog');
    const step = dialog.locator('label').filter({ has: page.locator('span').filter({ hasText: /^步长$/ }) }).locator('input');
    await step.fill('0'); await dialog.locator('.game-effect-actions .primary').click();
    await expect(dialog).toBeVisible(); assert.deepEqual(await state(), before);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(await state(), before);
    assert.equal(impactPrompts.length,promptsBeforeInvalid,'invalid, no-op and rejected operations do not prompt');
    await redo(); assert.equal((await state()).document.levels[0].frameList[1].matrix[0].y, 1);
    await undo();
    await apply('after');
    assert.equal((await state()).redo, 0, 'new real effect clears redo');
  });

  await check('after mode checks inserted frames rather than a pre-existing overlap in the current frame', async () => {
    await mount('[1]');
    await evaluate(() => {
      const s = window.getComponentSetup();
      s.activeFrame.matrix.push({ ...s.activeFrame.matrix[0], id: 'legacy-overlap' });
    });
    const before = await state();
    await apply('after'); assert.equal((await state()).undo, 1);
    await undo(); assert.deepEqual(content(await state()), content(before));
    await redo(); assert.equal((await state()).document.levels[0].frameList.length, 8);
  });
  assert.equal(await evaluate(() => window.fixture.writes), 0);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'effect-history.png') });
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') });
  throw error;
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve)); await vite.close();
}
