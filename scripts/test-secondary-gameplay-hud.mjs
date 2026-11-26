import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = createRequire(path.join(root, '../ledGame-platform/package.json'))('playwright');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/secondary-gameplay-hud');
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: path.join(cache, chrome, 'chrome-win64/chrome.exe') });
try {
  const page = await browser.newPage({ viewport: { width: 1720, height: 814 } });
  await page.addInitScript(() => {
    window.ledGame = {
      touchGameState: async () => ({ engineState: 'IDLE' }),
      onEngineState(fn) { window.publishGameState = fn; },
    };
  });
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/tests/ui/catalog-library-harness.html', {waitUntil:'domcontentloaded', timeout:120000});
  await page.waitForFunction(() => window.mountComponent);
  await page.addStyleTag({ content: '#app { padding: 0 !important; }' });
  await page.evaluate(async () => { await window.changeTestLocale('zh-CN'); window.mountComponent('SecondaryDisplayView'); });
  await page.getByTestId('secondary-display-idle').waitFor();
  const publish = state => page.evaluate(value => window.publishGameState(value), state);
  const challenge = {
    gameType: 'default', engineState: 'RUNNING', currentStageIndex: 1,
    gameTime: { mode: 'LIMITED', remainingMillis: 883000, running: false },
    gameplay: { stageLabel: 'Level 2', life: 10, lifeLimited: true, rewardPoints: 10, targetCount: 70, completedTargetCount: 8 },
  };
  await publish(challenge);
  const hub = page.getByTestId('challenge-hud');
  await hub.getByText('14:43').waitFor();
  assert.equal(await hub.locator('.life-icon').count(), 8);
  assert.deepEqual(await hub.locator('.stat-row strong').allTextContents(), ['10', '62']);
  await hub.getByText('奖励积分').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, 'challenge.png') });
  await publish({ ...challenge, gameplay: { ...challenge.gameplay, life: 3, completedTargetCount: 69 } });
  await hub.getByText('x3').waitFor();
  assert.deepEqual(await hub.locator('.stat-row strong').allTextContents(), ['10', '1']);
  await publish({ ...challenge, gameplay: { ...challenge.gameplay, lifeLimited: false } });
  await hub.getByText('x∞').waitFor();
  const colors = ['#1400ff','#15ff00','#ff0000','#00ffff','#ffee00','#ff00ff'];
  function rank(count) {
    return { engineState: 'RUNNING', gameType: 'rank', gameplay: { levelLabel: 'Ranking', remainingMillis: 41000,
      players: colors.slice(0,count).map((color,i) => ({ color, playerNumber:i+1, stageScore:i, totalScore:i+10 })) } };
  }
  await publish(rank(2));
  const board = page.getByTestId('secondary-rank-hud');
  await board.getByText('玩家A').waitFor();
  await board.getByText('41').waitFor();
  assert.deepEqual(await board.locator('.rank-player-score').allTextContents(), ['0','1']);
  await page.screenshot({ path: path.join(output,'rank.png') });
  await publish(rank(6));
  assert.equal(await board.locator('.rank-player').count(), 6);
  await publish({ ...rank(2), engineState: 'PAUSED' });
  await page.getByText('已暂停').waitFor();
  await publish({ ...rank(2), engineState: 'SETTLING', stageOutcome: 'SUCCESS' });
  await page.locator('.result-layer').waitFor();
  await publish({ engineState:'IDLE' });
  await page.getByTestId('secondary-display-idle').waitFor();
  console.log('Passed both live HUDs, realtime updates, pause, settlement and idle.');
} finally { await browser.close(); await server.close(); }
