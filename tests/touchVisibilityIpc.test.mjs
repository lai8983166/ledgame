import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('metadata IPC broadcasts visibility only after successful persistence to all live windows', async () => {
  const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const registration = main.match(/ipcMain\.handle\('game:metadata-update',[\s\S]*?\n\}\)/)[0];
  let handler, fail = false, requests = [], notifications = [];
  vm.runInNewContext(registration, {
    ipcMain: { handle: (_name, fn) => { handler = fn; } },
    backendRequest: async (...args) => { requests.push(args); if (fail) throw new Error('Write failed'); return { data: true }; },
    BrowserWindow: { getAllWindows: () => [false, false, true].map(dead => ({
      isDestroyed: () => dead, webContents: { send: (...args) => notifications.push(args) },
    })) },
  });
  await handler(null, 7, { childModeVisible: false });
  assert.equal(requests[0][0], '/games/7/metadata');
  assert.deepEqual(JSON.parse(requests[0][1].body), { childModeVisible: false });
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0][0], 'game-catalog-changed');
  notifications = []; fail = true;
  await assert.rejects(handler(null, 7, { childModeVisible: true }));
  assert.equal(notifications.length, 0);
  fail = false; await handler(null, 7, { name: 'draft' });
  assert.equal(notifications.length, 0);
});

test('catalog notification preload installs and removes the exact listener', async () => {
  const source = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
  let bridge, channel, listener, removed, seen;
  vm.runInNewContext(source, { require: () => ({
    contextBridge: { exposeInMainWorld: (key, value) => { if (key === 'ledGame') bridge = value; } },
    ipcRenderer: { invoke: () => {}, on: (key, fn) => { channel = key; listener = fn; },
      removeListener: (key, fn) => { removed = [key, fn]; } },
  }), process: { argv: [], env: {} }, window: { location: { search: '' } }, URLSearchParams });
  const unsubscribe = bridge.onCatalogChanged(value => { seen = value; });
  listener(null, { gameId: 7 }); assert.equal(seen.gameId, 7);
  unsubscribe(); assert.equal(channel, 'game-catalog-changed');
  assert.equal(removed[0], channel); assert.equal(removed[1], listener);
});
