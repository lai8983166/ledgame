import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ordinary entry is production while editor uses its separate simulation IPC', async () => {
  const main = await readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
  const flow = main.slice(main.indexOf('async function enterGameFlow('),main.indexOf('function executePreparationRequest('));
  assert.match(flow,/gameFlowWindowPlan\('game'\)/);
  assert.doesNotMatch(flow,/settings\.mode|options\?\.mode/);
  const prepare = main.slice(main.indexOf("ipcMain.handle('game:preparation:create',"),main.indexOf("ipcMain.handle('game:preparation:create-wristband',"));
  assert.match(prepare,/runtimeMode: 'PRODUCTION'/);
  const debug = main.slice(main.indexOf("ipcMain.handle('editor-debug:prepare',"),main.indexOf("ipcMain.handle('engine:debug-command',"));
  assert.match(debug,/runtimeMode: 'SIMULATION'/);
});

test('requested explanations are removed from their rendered templates, not globally hidden', async () => {
  const files = await Promise.all(['../src/views/SimpleGameEditorView.vue','../src/components/GameEffectDialog.vue','../src/views/ApplicationSettingsView.vue'].map(file=>readFile(new URL(file,import.meta.url),'utf8')));
  assert.doesNotMatch(files[0],/t\(['"]management\.simpleRewardHint['"]\)|t\(['"]circleLights\.layoutRequired['"]\)/);
  assert.doesNotMatch(files[1],/t\(['"]effect\.coordinateHint['"]\)/);
  const settings = files[2].split('<style')[0].slice(files[2].indexOf('<template>'));
  assert.doesNotMatch(settings,/<small(?!\s+v-if="fieldError)|<[^>]+class="application-settings-range-hint"|memberPlatform\.description|modeHints/);
  assert.match(settings,/application-settings-error/);
});
