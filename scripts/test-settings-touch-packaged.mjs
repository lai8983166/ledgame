import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '../ledGame-platform/package.json'));
const { _electron } = require('playwright');
await mkdir(path.join(root, '.build'), { recursive: true });
const data = await mkdtemp(path.join(root, '.build/settings-touch-packaged-'));
const healthRequests = [];
const member = http.createServer((request, response) => {
  healthRequests.push(request.url);
  response.writeHead(request.url === '/api/health' ? 200 : 404, {'Content-Type':'application/json'});
  response.end('{"status":"UP"}');
});
await new Promise(resolve => member.listen(0, '127.0.0.1', resolve));
const memberPort = member.address().port;
await mkdir(path.join(data, 'settings'), { recursive: true });
await writeFile(path.join(data, 'settings/application.json'), JSON.stringify({ memberPlatformPort: memberPort, mode: 'debug', entryMethod: 'touch' }));
const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port; await new Promise(resolve => server.close(resolve));
const env = { ...process.env, LED_USER_DATA_DIR: data, LED_DEBUG_TCP_PORT: '0', LED_PORTABLE_BACKEND_PORT: String(port), LED_ROOM_CONNECTION_ENABLED: 'false', ELC408_ENABLED: 'false', LED_DISABLE_DEVTOOLS: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const passed = [];
async function launch() {
  app = await _electron.launch({ executablePath: path.join(root, 'release/win-unpacked/LED Game.exe'), env, timeout: 90000 });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    page = app.windows().find(window => !window.isClosed() && window.url().includes('/dist/index.html') && !window.url().includes('window='));
    if (page && await page.getByTestId('game-menu-button').count()) { await page.locator('.game-category-heading').waitFor(); return; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Packaged main window did not become ready');
}
async function selectGames() {
  await page.getByTestId('game-menu-button').click();
  await page.getByRole('menuitem', { name: '游戏列表', exact: true }).click();
  await page.locator('.game-card').first().waitFor();
}
async function findWindow(kind) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const window = app.windows().find(window => window.url().includes(`window=${kind}`));
    if (window) return window;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Missing ${kind} window`);
}
try {
  const config = JSON.parse(await readFile(path.join(root, 'release/win-unpacked/elc408/conf.json'), 'utf8'));
  const wiring = JSON.parse(await readFile(path.join(root, 'release/win-unpacked/elc408/wiring.json'), 'utf8'));
  assert.equal(config.rgbMode, 'GRB'); assert.equal(config.tcpServerPort, 3003);
  assert.equal(wiring.width, 16); assert.equal(wiring.height, 36);
  passed.push('打包默认 GRB、16×36、3003；网卡选择配置保留');
  await launch();
  const connection = await (await fetch(`http://127.0.0.1:${port}/api/member-platform/connection`)).json();
  assert.equal(connection.port, memberPort);
  await page.locator('.nav-tab').filter({ hasText: /^配置$/ }).click();
  await page.locator('.application-settings-field input').first().fill('验收标题');
  assert.equal(await page.locator('input[max="65535"]').count(), 0);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForFunction(async () => (await window.appSettings.get()).applicationTitle === '验收标题');
  assert.equal(await page.evaluate(async () => (await window.appSettings.get()).memberPlatformPort), memberPort);
  await page.getByRole('button', {name:'测试连接',exact:true}).click();
  await page.getByText('会员管理端可访问', {exact:true}).waitFor();
  // The room WebSocket may connect in the background; the connection-test API
  // itself must use only the public health endpoint.
  assert.deepEqual(healthRequests.filter(url => url.startsWith('/api/')), ['/api/health']);
  await page.screenshot({ path: path.join(data, 'settings.png') });
  passed.push('真实 EXE 配置保存、隐藏端口及旧自定义端口保留');
  await page.locator('.nav-tab').filter({ hasText: /^帮助/ }).click();
  await page.getByRole('menuitem').filter({ hasText: '调试助手' }).click();
  assert.equal(await page.getByRole('tab').count(), 2);
  assert.equal(await page.getByRole('tab').first().getAttribute('aria-selected'), 'true');
  await page.getByRole('tab').last().click();
  assert.equal(await page.getByRole('combobox', { name: 'RGB 线序', exact: true }).inputValue(), 'GRB');
  await page.screenshot({ path: path.join(data, 'assistant.png') });
  passed.push('真实 EXE 两子页、默认布线、调试默认 GRB');
  await selectGames();
  const id = Number(await page.locator('.game-card').first().getAttribute('data-id'));
  await page.evaluate(() => window.ledGame.enterGameFlow({ mode: 'debug' }));
  const touch = await findWindow('touch');
  await touch.locator('.touch-shell[data-state="IDLE"]').waitFor();
  await touch.screenshot({ path: path.join(data, 'touch-idle.png') });
  await page.evaluate(async id => {
    const prepared = (await window.ledGame.createPreparation()).data;
    await window.ledGame.selectPreparationGame(prepared.preparation.sessionId, id);
  }, id);
  await touch.getByTestId(`game-option-${id}`).waitFor();
  await page.locator(`.game-card[data-id="${id}"] .game-card-edit`).click();
  await page.locator('.game-info-name input').fill('不会保存的草稿');
  await page.locator('.game-info-visibility input').uncheck();
  await touch.locator('.touch-shell[data-state="IDLE"]').waitFor();
  await page.locator('.game-info-actions .soft-button').click();
  assert.ok((await page.evaluate(async () => (await window.ledGame.listManageableGames()).data)).some(game => game.gameId === id));
  assert.ok(!(await page.evaluate(async () => (await window.ledGame.listPlayableGames()).data)).some(game => game.gameId === id));
  passed.push('真实跨窗口立即更新，取消准备回待机，取消草稿不撤销显示开关');
  // Hidden games remain editable and can be started explicitly in simulation.
  await page.evaluate(id => window.ledGame.startGame({ id, runtimeMode: 'SIMULATION' }), id);
  assert.ok(['STARTING', 'RUNNING'].includes((await page.evaluate(() => window.ledGame.state())).data.engineState));
  await page.evaluate(() => window.ledGame.stop());
  await page.evaluate(() => window.ledGame.startSystemIdle());
  passed.push('隐藏游戏仍可编辑器指定调试启动，不变成权限限制');
  await page.evaluate(() => window.secondaryDisplay.open());
  const secondary = await findWindow('secondary');
  await secondary.screenshot({ path: path.join(data, 'secondary-idle.png') });
  await app.close(); app = null;
  await launch();
  assert.equal(await page.evaluate(async () => (await window.appSettings.get()).applicationTitle), '验收标题');
  assert.equal(await page.evaluate(async () => (await window.appSettings.get()).memberPlatformPort), memberPort);
  const restartedConnection = await (await fetch(`http://127.0.0.1:${port}/api/member-platform/connection`)).json();
  assert.equal(restartedConnection.port, memberPort);
  assert.ok(!(await page.evaluate(async () => (await window.ledGame.listPlayableGames()).data)).some(game => game.gameId === id));
  assert.notEqual((await page.evaluate(async () => (await window.ledGame.listManageableGames()).data)).find(game => game.gameId === id).name, '不会保存的草稿');
  passed.push('关闭再启动，标题、旧端口和触屏显示开关持久化');
  console.log(JSON.stringify({ data, passed }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(data, 'failure.png') });
  console.error('Evidence: ' + data); throw error;
} finally {
  await app?.close();
  await new Promise(resolve => member.close(resolve));
  await writeFile(path.join(data, 'results.json'), JSON.stringify({ passed }, null, 2));
}
