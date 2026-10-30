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
const output = path.join(root, '.build/feedback-category-ui');
await mkdir(output, { recursive: true });
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false } });
const server = createHttpServer(vite.middlewares);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const passed = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const games = [
    { id: 1, type: 'default', name: '未分类游戏', firstCatalog: '' },
    { id: 2, type: 'rank', name: '其他分类游戏', firstCatalog: '2' },
    { id: 3, type: 'default', name: '儿童模式隐藏游戏', firstCatalog: '', childModeVisible: false },
    { id: 4, type: 'default', name: 'simple-demo', firstCatalog: '' },
  ];
  const categories = [{ id: 1, name: '空分类', cover: 'wide.svg' }, { id: 2, name: '原分类', cover: 'tall.svg' }, { id: 3, name: '第二个空分类' }];
  const fixture = window.categoryFixture = { games, categories, requests: [], failId: null, delay: 0 };
  window.appLanguage = { get: async () => 'zh-CN', onChanged: () => () => {} };
  window.ledGame = {
    listManageableGames: async () => ({ data: structuredClone(games) }),
    listGameCategories: async () => ({ data: structuredClone(categories) }),
    updateGameMetadata: async (id, patch) => {
      fixture.requests.push([id, structuredClone(patch)]);
      if (fixture.delay) await new Promise(resolve => setTimeout(resolve, fixture.delay));
      if (id === fixture.failId) throw Error('测试保存失败');
      const game = games.find(item => item.id === id);
      Object.assign(game, patch);
      return { code: 200, data: structuredClone(game) };
    },
  };
});
const button = name => page.getByRole('button', { name, exact: true });
const openCategory = name => page.locator('.game-category-card-main').filter({ has: page.getByRole('heading', { name, exact: true }) }).click();
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS ' + name); }
try {
  await page.route('led-media://preview/**', route => route.fulfill({ contentType: 'image/svg+xml', body: route.request().url().includes('wide')
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="cyan"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="magenta"/></svg>' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(() => window.mountComponent);
  await page.evaluate(() => window.mountComponent('GameListView'));
  await check('分类横竖封面容器随固有比例适配并完整显示', async () => {
    const covers=page.locator('.game-category-card-cover:has(img)');
    await expect(covers).toHaveCount(2);
    await expect.poll(()=>covers.evaluateAll(nodes=>nodes.every(node=>node.querySelector('img').naturalWidth>0))).toBe(true);
    const sizes=await covers.evaluateAll(nodes=>nodes.map(node=>{const image=node.querySelector('img'),rect=node.getBoundingClientRect();return{ratio:rect.width/rect.height,natural:image.naturalWidth/image.naturalHeight,fit:getComputedStyle(image).objectFit};}));
    for(const size of sizes){assert.ok(Math.abs(size.ratio-size.natural)<.03,JSON.stringify(size));assert.equal(size.fit,'contain');}
    await page.screenshot({path:path.join(output,'自适应封面.png')});
  });
  await check('空分类显示加号而非重新加载，取消不保存并还原焦点', async () => {
    await openCategory('空分类');
    await expect(button('重新加载')).toHaveCount(0);
    await expect(button('添加游戏')).toHaveText('+');
    await button('添加游戏').click();
    await expect(page.locator('.category-game-picker-option')).toHaveCount(3);
    await expect(button('确认')).toBeDisabled();
    await page.getByRole('checkbox', { name: '未分类游戏', exact: true }).check();
    await page.screenshot({ path: path.join(output, 'game-picker.png') });
    await button('取消').click();
    assert.equal(await page.evaluate(() => window.categoryFixture.requests.length), 0);
    await expect(button('添加游戏')).toBeFocused();
    await button('添加游戏').click();
    await expect(page.getByRole('checkbox', { name: '未分类游戏', exact: true })).not.toBeChecked();
    await page.keyboard.press('Escape');
    await expect(page.locator('.category-game-picker-dialog')).toHaveCount(0);
  });
  await check('多选添加仅保存分类字段，可从其他分类移动且重载后保留', async () => {
    await button('添加游戏').click();
    await page.getByRole('checkbox', { name: '未分类游戏', exact: true }).check();
    await page.getByRole('checkbox', { name: '其他分类游戏', exact: true }).check();
    await button('确认').click();
    await expect(page.locator('.category-game-picker-dialog')).toHaveCount(0);
    await expect(page.locator('.game-card')).toHaveCount(2);
    assert.deepEqual(await page.evaluate(() => window.categoryFixture.requests), [[1, { firstCatalog: '1' }], [2, { firstCatalog: '1' }]]);
    await page.evaluate(() => window.mountComponent('GameListView'));
    await openCategory('空分类');
    await expect(page.locator('.game-card')).toHaveCount(2);
    await button('返回首页').click(); await openCategory('原分类');
    await expect(page.locator('.game-card')).toHaveCount(0);
    await expect(button('添加游戏')).toBeVisible();
    await button('返回首页').click();
  });
  await check('批量部分失败保留成功项，重试仅提交未成功的选择', async () => {
    await openCategory('第二个空分类');
    await button('添加游戏').click();
    await page.getByRole('checkbox', { name: '未分类游戏', exact: true }).check();
    await page.getByRole('checkbox', { name: '其他分类游戏', exact: true }).check();
    await page.evaluate(() => window.categoryFixture.failId = 2);
    await button('确认').click();
    await expect(page.locator('.category-game-picker-dialog [role="alert"]')).toHaveText('测试保存失败');
    await expect(page.getByRole('checkbox', { name: '未分类游戏', exact: true })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: '其他分类游戏', exact: true })).toBeChecked();
    await page.evaluate(() => { window.categoryFixture.failId = null; window.categoryFixture.delay = 350; });
    await button('确认').click();
    await expect(page.locator('.category-game-picker-dialog input:disabled')).toHaveCount(2);
    await expect(button('取消')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('.category-game-picker-dialog')).toBeVisible();
    await expect(page.locator('.category-game-picker-dialog')).toHaveCount(0);
    await expect(page.locator('.game-card')).toHaveCount(2);
    assert.deepEqual(await page.evaluate(() => window.categoryFixture.requests.slice(2)), [
      [1, { firstCatalog: '3' }], [2, { firstCatalog: '3' }], [2, { firstCatalog: '3' }],
    ]);
    await page.screenshot({ path: path.join(output, 'category-games.png') });
  });
  await check('未知历史分类不生成乱码选项，有效中文分类保持可选且取消不修改原数据', async () => {
    await page.evaluate(() => {
      window.legacyConfig = { name: '历史游戏', firstCatalog: '鍘嗗彶绫诲埆', siteSizeWidth: 16, siteSizeHeight: 36 };
      window.mountComponent('GameGlobalConfigDialog', { config: window.legacyConfig, categories: [{ id: 8, name: '合法旧分类' }] });
    });
    const select = page.locator('.global-config-field').filter({ hasText: '一级菜单' }).locator('select');
    await expect(select.locator('option')).toHaveText(['未分配分类', '合法旧分类']);
    await expect(select).toHaveValue('');
    await button('取消').click();
    assert.equal(await page.evaluate(() => window.legacyConfig.firstCatalog), '鍘嗗彶绫诲埆');
    await page.evaluate(() => window.mountComponent('GameGlobalConfigDialog', { config: { firstCatalog: '8' }, categories: [{ id: 8, name: '合法旧分类' }] }));
    await expect(select).toHaveValue('8');
    await page.screenshot({ path: path.join(output, 'known-category-options.png') });
  });
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') });
  throw error;
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed, errors }, null, 2));
  await browser.close(); await vite.close(); await new Promise(resolve => server.close(resolve));
}
