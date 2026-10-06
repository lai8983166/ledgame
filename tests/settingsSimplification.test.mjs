import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DEFAULT_CONFIG_DRAFT, DEFAULT_DEBUG_DRAFT } from '../src/lib/elc408/elc408ToolsState.js';
const require = createRequire(import.meta.url);
const { normalizeConfigDraft, normalizeDebugStartRequest } = require('../electron/elc408Ipc.cjs');
const { createApplicationSettingsStore } = require('../electron/application-settings.cjs');
const source = (file) => fs.readFile(new URL('../' + file, import.meta.url), 'utf8');

test('new hardware drafts and IPC default to GRB without changing explicit RGB', () => {
  assert.equal(DEFAULT_CONFIG_DRAFT.rgbMode, 'GRB');
  assert.equal(DEFAULT_DEBUG_DRAFT.rgbMode, 'GRB');
  for (const normalize of [normalizeConfigDraft, normalizeDebugStartRequest]) {
    assert.equal(normalize({}).rgbMode, 'GRB');
    assert.equal(normalize({ rgbMode: 'RGB' }).rgbMode, 'RGB');
    assert.throws(() => normalize({ rgbMode: 'XYZ' }), /rgbMode/);
  }
});

test('settings retain a custom hidden port when editing the host or other fields', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'led-settings-'));
  try {
    const settingsPath = path.join(directory, 'settings.json');
    const store = createApplicationSettingsStore({ fs, settingsPath });
    assert.equal((await store.get()).memberPlatformPort, 8090);
    await store.update({ memberPlatformPort: 18090 });
    await store.update({ memberPlatformHost: '192.168.50.10', applicationTitle: 'Test' });
    const reopened = await createApplicationSettingsStore({ fs, settingsPath }).get();
    assert.equal(reopened.memberPlatformPort, 18090);
    assert.equal(reopened.memberPlatformHost, '192.168.50.10');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
  const view = await source('src/views/ApplicationSettingsView.vue');
  assert.doesNotMatch(view, /<input[^>]*v-model\.number="draft\.memberPlatformPort"/);
  assert.match(view, /memberPlatformPort: Number\(draft.memberPlatformPort\)/);
});

test('hardware assistant starts with wiring and does not mount the old configuration tab', async () => {
  const view = await source('src/views/Elc408DebugAssistantView.vue');
  assert.match(view, /activePanel = ref\("wiringTools"\)/);
  assert.doesNotMatch(view, /Elc408ConfigurationPanel|id: "configuration"/);
});

test('decorative subtitles are removed while business information remains', async () => {
  for (const file of ['src/views/ApplicationSettingsView.vue', 'src/views/MediaLibraryView.vue',
    'src/views/DatabaseRefreshView.vue', 'src/views/Elc408DebugAssistantView.vue',
    'src/components/GameGlobalConfigDialog.vue', 'src/components/GameEffectDialog.vue',
    'src/components/PixelLightLayoutDialog.vue']) {
    assert.doesNotMatch((await source(file)).split('<template>')[1].split('<style')[0], /t\(["'][\w]+\.subtitle["']\)/, file);
  }
  assert.match(await source('src/components/GameInfoEditDialog.vue'), /<p>\{\{ game.name \}\}<\/p>/);
  assert.match(await source('src/views/GameListView.vue'), /v-if="selectedCategory"/);
});
