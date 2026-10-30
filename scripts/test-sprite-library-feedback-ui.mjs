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
const output = path.join(root, '.build/sprite-library-feedback-ui');
await mkdir(output, { recursive: true });
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false } });
const server = createHttpServer(vite.middlewares);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const passed = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const spirits = [
    { id: 'wide', name: 'Alpha', color: 2, width: 4, height: 2, points: '[[0,0],[3,1]]', basic: true },
    { id: 'tall', name: 'Beta', color: 3, width: 1, height: 16, points: '[[0,0],[0,15]]', basic: false },
  ];
  const fixture = window.spriteFixture = { spirits, reads: 0, writes: [], failSave: false, failList: false, confirm: true };
  window.confirm = () => fixture.confirm;
  window.appLanguage = { get: async () => 'zh-CN', onChanged: () => () => {} };
  window.spiritLibrary = {
    list: async () => {
      fixture.reads++;
      if (fixture.failList) { fixture.failList = false; throw Error('刷新失败'); }
      return { data: structuredClone(spirits) };
    },
    create: async payload => {
      if (fixture.failSave) throw Error('保存失败');
      fixture.writes.push(['create', structuredClone(payload)]);
      const item = { ...payload, id: 'created', points: JSON.stringify(payload.points), basic: false };
      spirits.push(item);
      return { data: structuredClone(item) };
    },
    update: async (id, payload) => {
      if (fixture.failSave) throw Error('保存失败');
      fixture.writes.push(['update', id, structuredClone(payload)]);
      const item = spirits.find(item => item.id === id);
      Object.assign(item, payload, { points: JSON.stringify(payload.points) });
      return { data: structuredClone(item) };
    },
    delete: async id => {
      fixture.writes.push(['delete', id]);
      spirits.splice(spirits.findIndex(item => item.id === id), 1);
      return { data: true };
    },
  };
});
const card = id => page.locator(`.spirit-thumbnail-card[data-id="${id}"]`);
const name = page.locator('.spirit-editor-name input');
const save = page.locator('.spirit-editor-actions .primary');
async function check(title, fn) { await fn(); passed.push(title); console.log('PASS ' + title); }
async function edit(id) {
  await card(id).locator('.spirit-thumbnail-select').click();
  await card(id).hover();
  await card(id).locator('.spirit-card-actions button').first().click();
  await expect(page.locator('.spirit-editor-dialog')).toBeVisible();
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(() => window.mountComponent);
  await page.evaluate(() => window.mountComponent('SpiritLibraryView'));
  await expect(page.locator('.spirit-thumbnail-card')).toHaveCount(2);
  await check('固定修改删除和刷新入口移除，只有选中卡片悬停显示底部操作', async () => {
    await expect(page.locator('.spirit-browser-toolbar button')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '刷新', exact: true })).toHaveCount(0);
    await page.mouse.move(1200, 680);
    await expect(card('wide').locator('.spirit-card-actions')).toBeHidden();
    await card('tall').hover();
    await expect(card('tall').locator('.spirit-card-actions')).toHaveCount(0);
    await card('wide').hover();
    await expect(card('wide').locator('.spirit-card-actions')).toBeVisible();
    const bounds = await card('wide').evaluate(node => {
      const card = node.getBoundingClientRect(), actions = node.querySelector('.spirit-card-actions').getBoundingClientRect();
      return { card: { top: card.top, bottom: card.bottom }, actions: { top: actions.top, bottom: actions.bottom } };
    });
    assert.ok(bounds.actions.top > (bounds.card.top + bounds.card.bottom) / 2);
    assert.ok(bounds.actions.bottom <= bounds.card.bottom);
    await page.screenshot({ path: path.join(output, '选中精灵悬停操作.png') });
  });
  await check('键盘选中后底部操作可获取焦点，无嵌套按钮', async () => {
    await page.mouse.move(1200, 680);
    await card('tall').locator('.spirit-thumbnail-select').focus();
    await page.keyboard.press('Enter');
    await expect(card('tall')).toHaveClass(/selected/);
    await expect(card('tall').locator('.spirit-card-actions')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(card('tall').locator('.spirit-card-actions button').first()).toBeFocused();
    assert.equal(await page.locator('button button').count(), 0);
  });
  await check('编辑名称可取消，空名禁用保存，改名及图形一起保存并自动重读', async () => {
    await edit('wide');
    await expect(name).toHaveValue('Alpha');
    await name.fill('取消改名');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.spriteFixture.writes.length), 0);
    await edit('wide');
    await name.fill('   ');
    await expect(save).toBeDisabled();
    await name.fill('  Renamed  ');
    await page.locator('.spirit-editor-size-controls input').first().fill('3');
    await save.click();
    await expect(page.locator('.spirit-editor-dialog')).toHaveCount(0);
    await expect(card('wide').locator('strong')).toHaveText('Renamed');
    await expect.poll(() => page.evaluate(() => window.spriteFixture.reads)).toBe(2);
    assert.deepEqual(await page.evaluate(() => window.spriteFixture.writes[0]), ['update', 'wide', { name: 'Renamed', width: 3, height: 2, points: [[0, 0]] }]);
    const updated = await page.evaluate(() => window.spriteFixture.spirits.find(item => item.id === 'wide'));
    assert.equal(updated.color, 2);
    assert.equal(updated.basic, true);
  });
  await check('保存失败保留名称草稿可重试，创建后自动刷新并选中新精灵', async () => {
    await page.locator('.spirit-heading .icon-add-button').click();
    await name.fill('Created');
    await page.evaluate(() => window.spriteFixture.failSave = true);
    await save.click();
    await expect(page.locator('.spirit-editor-error')).toHaveText('保存失败');
    await expect(name).toHaveValue('Created');
    await page.evaluate(() => window.spriteFixture.failSave = false);
    await save.click();
    await expect(page.locator('.spirit-editor-dialog')).toHaveCount(0);
    await expect(card('created')).toHaveClass(/selected/);
    await expect.poll(() => page.evaluate(() => window.spriteFixture.reads)).toBe(3);
    await expect(page.locator('.status-line')).toContainText('Created');
  });
  await check('取消删除不重读，确认删除自动重读并选择相邻精灵', async () => {
    await page.evaluate(() => window.spriteFixture.confirm = false);
    await card('created').hover();
    await card('created').locator('.spirit-delete-button').click();
    await expect(card('created')).toHaveCount(1);
    assert.equal(await page.evaluate(() => window.spriteFixture.reads), 3);
    await page.evaluate(() => window.spriteFixture.confirm = true);
    await card('created').hover();
    await card('created').locator('.spirit-delete-button').click();
    await expect(card('created')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.spriteFixture.reads)).toBe(4);
    assert.equal(await page.locator('.spirit-thumbnail-card.selected').count(), 1);
  });
  await check('成功保存后重读失败保留实际修改且报错，后续修改仍能刷新', async () => {
    await edit('wide');
    await name.fill('Saved despite list failure');
    await page.evaluate(() => window.spriteFixture.failList = true);
    await save.click();
    await expect(page.locator('.spirit-editor-dialog')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveText('刷新失败');
    await expect(card('wide').locator('strong')).toHaveText('Saved despite list failure');
    await edit('wide');
    await name.fill('Final name');
    await save.click();
    await expect(card('wide').locator('strong')).toHaveText('Final name');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.spriteFixture.reads)).toBe(6);
  });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(path.join(output, '验证记录.json'), JSON.stringify({ passed, errors }, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await vite.close();
}
