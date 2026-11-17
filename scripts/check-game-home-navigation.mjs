import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, '.build'), { recursive: true });
const work = fs.mkdtempSync(path.join(root, '.build', 'game-home-navigation-'));
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice('--baseline='.length);
const previous = new Map();
const transformed = new Set();
if (baseline) for (const file of ['src/App.vue', 'src/views/GameListView.vue']) {
  previous.set(path.join(root, file).replaceAll('\\', '/'), execFileSync('git', ['show', `${baseline}:${file}`],
    { cwd: root, encoding: 'utf8', windowsHide: true }));
}
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false },
  plugins: baseline ? [{ name: 'navigation-baseline', enforce: 'pre', transform(code, id) {
    const old = previous.get(id.replaceAll('\\', '/'));
    if (old !== undefined) transformed.add(id);
    return old === undefined ? null : { code: old, map: null };
  } }] : [],
});
let browser;
const server = http.createServer(vite.middlewares);
const report = { baseline: baseline || null, checks: [], errors: [], passed: false };
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(() => {
    const game = { id: 11, name: 'Category A Game', type: 'default', firstCatalog: '1',
      siteSizeWidth: 4, siteSizeHeight: 4, levels: [{ label: 'Level 1', option: {},
        frameList: [{ repeatTimes: 1, matrix: [] }] }] };
    window.appLanguage = { get: async () => 'zh-CN', onChanged: () => () => {} };
    window.appSettings = { get: async () => ({}), getIconData: async () => ({}), onChanged: () => () => {} };
    window.secondaryDisplay = { list: async () => ({ displays: [] }) };
    window.ledGame = { windowKind: 'main',
      activationStatus: async () => ({ data: { activated: true } }),
      state: async () => ({ data: { engineState: 'IDLE' } }),
      listManageableGames: async () => ({ data: [structuredClone(game)] }),
      listGameCategories: async () => ({ data: [{ id: 1, name: 'Category A' }, { id: 2, name: 'Category B' }] }),
      getGameEditor: async () => ({ data: structuredClone(game) }),
    };
    window.spiritLibrary = { list: async () => ({ data: [] }) };
  });
  const address = server.address();
  await page.goto(`http://127.0.0.1:${address.port}/tests/ui/catalog-library-harness.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.mountComponent === 'function', undefined, { timeout: 60000 });
  await page.evaluate(() => window.mountComponent('App'));
  const grid = page.locator('.game-category-grid');
  const detail = page.locator('.game-category-breadcrumb');
  const choose = async name => {
    await page.getByTestId('game-menu-button').click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };
  const enter = async name => {
    await grid.waitFor();
    await page.locator('.game-category-card-main').filter({ hasText: name }).click();
    await detail.waitFor();
    await page.getByRole('heading', { level: 1, name, exact: true }).waitFor();
  };

  for (const name of ['Category A', 'Category B', 'Category A']) {
    await enter(name);
    await choose('首页');
    await grid.waitFor();
    assert.equal(await detail.count(), 0);
  }
  report.checks.push('Entering either category and selecting Game/Home repeatedly returns to the category grid');

  await enter('Category A');
  await page.getByTestId('game-menu-button').click();
  await page.keyboard.press('Escape');
  await detail.waitFor();
  await page.getByTestId('game-menu-button').click();
  await page.locator('.page-heading h1').click();
  await detail.waitFor();
  assert.equal(await page.getByRole('menuitem').count(), 0);
  report.checks.push('Opening and dismissing the menu preserves the current category');

  await page.locator('.game-card-main').hover();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.locator('.simple-editor-fit-shell.ready').waitFor();
  await page.getByRole('button', { name: '返回列表', exact: true }).click();
  await detail.waitFor();
  await page.getByRole('heading', { level: 1, name: 'Category A', exact: true }).waitFor();
  report.checks.push('Normal editor return preserves the selected category');

  await page.locator('.game-card-main').hover();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.locator('.simple-editor-fit-shell.ready').waitFor();
  await page.evaluate(() => {
    document.querySelector('.simple-editor-workspace').__vueParentComponent.setupState.document.levels[0].frameList[0].repeatTimes++;
  });
  const requestBefore = await page.evaluate(() => window.getComponentSetup().gameNavigationRequest);
  await choose('首页');
  await page.locator('.editor-leave-dialog').waitFor();
  await page.locator('[data-stay]').click();
  assert.equal(await page.evaluate(() => window.getComponentSetup().activeView), 'simple-editor');
  assert.equal(await page.evaluate(() => window.getComponentSetup().gameNavigationRequest), requestBefore);
  await choose('首页');
  await page.getByRole('button', { name: '不保存并离开', exact: true }).click();
  await grid.waitFor();
  report.checks.push('Cancelling unsaved editor departure keeps its draft; confirmed Home resets the cached category');

  await enter('Category A');
  await page.getByRole('button', { name: '配置', exact: true }).click();
  await page.locator('.application-settings-view').waitFor();
  await choose('首页');
  await grid.waitFor();
  await choose('游戏列表');
  assert.equal(await grid.count(), 0);
  assert.equal(await detail.count(), 0);
  await choose('首页');
  await grid.waitFor();
  report.checks.push('Home from another tab or the full game list displays the category root');
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await page.screenshot({ path: path.join(work, 'home.png') });
} catch (error) {
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await vite.close();
  if (baseline) report.baselineFiles = [...transformed];
  fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, work }, null, 2));
}
