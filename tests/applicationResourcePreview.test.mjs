import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createApplicationSettingsStore } = require('../electron/application-settings.cjs');
const { createApplicationResourcePreview } = require('../electron/application-resource-preview.cjs');
const { installSecondaryDisplayBackground } = require('../electron/application-branding.cjs');

test('resource preview changes effective values without writing settings; restart restores persisted resources', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'led-resource-preview-'));
  try {
    const settingsPath = path.join(directory, 'application.json');
    const store = createApplicationSettingsStore({ fs, settingsPath });
    const original = await store.update({ applicationIconPath: path.join(directory, 'old.png'), secondaryDisplayBackgroundPath: path.join(directory, 'background.png'), secondaryIdleMediaPath: path.join(directory, 'idle.mp4') });
    const bytes = await fs.readFile(settingsPath);
    const session = createApplicationResourcePreview({ settingsStore: store });
    const patch = { applicationIconPath: path.join(directory, 'new.png'), secondaryDisplayBackgroundPath: null, secondaryIdleMediaPath: path.join(directory, 'new.mp4') };
    const response = await session.select({ ...patch, navigationTitle: 'Cannot preview unrelated settings' });
    assert.deepEqual(response.resourcePreview, patch);
    for (const key of Object.keys(patch)) assert.equal(response[key], original[key]);
    assert.deepEqual(await session.effective(), { ...original, ...patch });
    assert.deepEqual(await fs.readFile(settingsPath), bytes);
    assert.deepEqual(await createApplicationResourcePreview({ settingsStore: createApplicationSettingsStore({ fs, settingsPath }) }).effective(), original);
    await session.update({ secondaryDisplay: null });
    assert.deepEqual((await session.get()).resourcePreview, patch);
    const saved = await session.update(patch);
    assert.deepEqual(saved.resourcePreview, {});
    const restarted = await createApplicationResourcePreview({ settingsStore: createApplicationSettingsStore({ fs, settingsPath }) }).effective();
    for (const key of Object.keys(patch)) assert.equal(restarted[key], patch[key]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('failed resource save keeps preview and new selections made during a save remain pending', async () => {
  let fail = true, release;
  const current = { applicationIconPath: 'old.png' };
  const store = {
    get: async () => ({ ...current }),
    update: async patch => { if (fail) throw Error('write failed'); await new Promise(resolve => { release = resolve; }); Object.assign(current, patch); return { ...current }; },
  };
  const session = createApplicationResourcePreview({ settingsStore: store });
  await session.select({ applicationIconPath: 'new.png' });
  await assert.rejects(session.update({ applicationIconPath: 'new.png' }), /write failed/);
  assert.equal((await session.effective()).applicationIconPath, 'new.png');
  assert.equal((await session.get()).applicationIconPath, 'old.png');
  fail = false;
  const pending = session.update({ applicationIconPath: 'new.png' });
  await session.select({ applicationIconPath: 'newer.png' });
  release();await pending;
  assert.equal((await session.get()).applicationIconPath, 'new.png');
  assert.equal((await session.effective()).applicationIconPath, 'newer.png');
});

test('selecting a new background never replaces the old fixed or previously selected background files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'led-background-preview-'));
  try {
    await fs.mkdir(path.join(directory, 'branding'));
    const old = path.join(directory, 'branding', 'secondary-display-background.png');
    await fs.writeFile(old, 'old saved background');
    const source = path.join(directory, 'selected.jpg');await fs.writeFile(source, 'image');
    let content = 'first';
    const args = { fs, source, userDataPath: directory, nativeImage: { createFromPath: () => ({ isEmpty: () => false, toPNG: () => Buffer.from(content) }) } };
    const first = await installSecondaryDisplayBackground(args);
    content = 'second';const second = await installSecondaryDisplayBackground(args);
    assert.notEqual(first, second);
    assert.equal(await fs.readFile(old, 'utf8'), 'old saved background');
    assert.equal(await fs.readFile(first, 'utf8'), 'first');
    assert.equal(await fs.readFile(second, 'utf8'), 'second');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('a real settings write failure retains preview and the next explicit save can retry successfully', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'led-preview-save-retry-'));
  try {
    const settingsPath = path.join(directory, 'application.json');
    const initial = createApplicationSettingsStore({ fs, settingsPath });
    await initial.update({ applicationIconPath: path.join(directory, 'old.png') });
    const original = await fs.readFile(settingsPath);
    let failOnce = true;
    const store = createApplicationSettingsStore({ fs: { ...fs, writeFile: async (...args) => {
      if (failOnce) { failOnce = false; throw Object.assign(Error('disk temporarily unavailable'), { code: 'EIO' }); }
      return fs.writeFile(...args);
    } }, settingsPath });
    const session = createApplicationResourcePreview({ settingsStore: store });
    const patch = { applicationIconPath: path.join(directory, 'new.png') };
    await session.select(patch);
    await assert.rejects(session.update(patch), /disk temporarily unavailable/);
    assert.deepEqual(await fs.readFile(settingsPath), original);
    assert.deepEqual((await session.get()).resourcePreview, patch);
    const result = await session.update(patch);
    assert.deepEqual(result.resourcePreview, {});
    assert.equal(JSON.parse(await fs.readFile(settingsPath, 'utf8')).applicationIconPath, patch.applicationIconPath);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
