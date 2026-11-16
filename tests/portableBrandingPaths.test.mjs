import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createApplicationSettingsStore } = require('../electron/application-settings.cjs');
const { createApplicationResourcePreview } = require('../electron/application-resource-preview.cjs');
const {
  installApplicationIcon,
  installSecondaryDisplayBackground,
  installSecondaryIdleMedia,
} = require('../electron/application-branding.cjs');

const fields = ['applicationIconPath', 'secondaryDisplayBackgroundPath', 'secondaryIdleMediaPath'];
const settingsFile = root => path.join(root, 'settings', 'application.json');
const storeFor = root => createApplicationSettingsStore({ fs, settingsPath: settingsFile(root), resourceRoot: root });
const nativeImage = { createFromPath: () => ({ isEmpty: () => false, toPNG: () => Buffer.from('converted-background') }) };

test('selected resources live in the package, preview stays unsaved, and copied packages use independent relative paths', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'led-portable-branding-'));
  try {
    const sources = path.join(temporary, 'selected-sources');
    await fs.mkdir(sources);
    const sourceIcon = path.join(sources, 'chosen.png');
    const sourceBackground = path.join(sources, 'chosen.jpg');
    const sourceIdle = path.join(sources, 'chosen.mp4');
    await Promise.all([
      fs.writeFile(sourceIcon, 'selected-icon'),
      fs.writeFile(sourceBackground, 'selected-background'),
      fs.writeFile(sourceIdle, 'selected-idle'),
    ]);
    const rootA = path.join(temporary, 'package-a', 'data');
    const rootB = path.join(temporary, 'package-b', 'data');
    const common = { fs, nativeImage, userDataPath: rootA, now: () => 'portable-test' };
    const patch = {
      applicationIconPath: await installApplicationIcon({ ...common, source: sourceIcon }),
      secondaryDisplayBackgroundPath: await installSecondaryDisplayBackground({ ...common, source: sourceBackground }),
      secondaryIdleMediaPath: await installSecondaryIdleMedia({ ...common, source: sourceIdle }),
    };
    const session = createApplicationResourcePreview({ settingsStore: storeFor(rootA) });
    await session.update({ navigationTitle: 'Package A' });
    const before = await fs.readFile(settingsFile(rootA));
    await session.select(patch);
    assert.deepEqual(await fs.readFile(settingsFile(rootA)), before);
    for (const field of fields) {
      assert.equal((await session.get())[field], null);
      assert.equal((await session.effective())[field], patch[field]);
    }
    await session.update(patch);
    const savedA = await fs.readFile(settingsFile(rootA));
    const diskA = JSON.parse(savedA);
    for (const field of fields) {
      assert.equal(diskA[field], `branding/${path.basename(patch[field])}`);
      assert.equal(path.isAbsolute(diskA[field]), false);
    }

    await fs.cp(rootA, rootB, { recursive: true });
    await fs.rename(sources, `${sources}-moved`);
    for (const field of fields) await fs.writeFile(patch[field], 'changed-in-A');

    const storeB = storeFor(rootB);
    const restoredB = await storeB.get();
    const expected = ['selected-icon', 'converted-background', 'selected-idle'];
    for (const [index, field] of fields.entries()) {
      assert.equal(restoredB[field], path.join(rootB, 'branding', path.basename(patch[field])));
      assert.equal(await fs.readFile(restoredB[field], 'utf8'), expected[index]);
    }
    await storeB.update({ navigationTitle: 'Package B' });
    assert.deepEqual(await fs.readFile(settingsFile(rootA)), savedA);
    await fs.writeFile(restoredB.secondaryIdleMediaPath, 'changed-in-B');
    assert.equal(await fs.readFile(patch.secondaryIdleMediaPath, 'utf8'), 'changed-in-A');

    const movedRoot = path.join(temporary, 'moved-package', 'data');
    await fs.cp(rootB, movedRoot, { recursive: true });
    const moved = await storeFor(movedRoot).get();
    for (const field of fields) assert.equal(moved[field], path.join(movedRoot, 'branding', path.basename(patch[field])));
    assert.equal(await fs.readFile(moved.secondaryIdleMediaPath, 'utf8'), 'changed-in-B');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('legacy absolute managed paths rebase locally and never fall back to the original package', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'led-portable-legacy-'));
  try {
    const oldRoot = path.join(temporary, 'old-package', 'data');
    const newRoot = path.join(temporary, 'new-package', 'data');
    const name = 'application-icon-legacy.png';
    await fs.mkdir(path.join(oldRoot, 'branding'), { recursive: true });
    await fs.mkdir(path.join(newRoot, 'branding'), { recursive: true });
    await fs.mkdir(path.dirname(settingsFile(newRoot)), { recursive: true });
    await fs.writeFile(path.join(oldRoot, 'branding', name), 'original-still-exists');
    await fs.writeFile(path.join(newRoot, 'branding', name), 'local-copy');
    await fs.writeFile(settingsFile(newRoot), JSON.stringify({
      applicationIconPath: path.join(oldRoot, 'branding', name),
      secondaryDisplayBackgroundPath: 'C:\\old-client\\data\\branding\\secondary-display-background-legacy.png',
      secondaryIdleMediaPath: path.join(oldRoot, 'arbitrary', 'secondary-idle-media-legacy.mp4'),
    }));
    const store = storeFor(newRoot);
    const current = await store.get();
    assert.equal(current.applicationIconPath, path.join(newRoot, 'branding', name));
    assert.equal(await fs.readFile(current.applicationIconPath, 'utf8'), 'local-copy');
    assert.equal(current.secondaryDisplayBackgroundPath, path.join(newRoot, 'branding', 'secondary-display-background-legacy.png'));
    await assert.rejects(fs.stat(current.secondaryDisplayBackgroundPath), { code: 'ENOENT' });
    assert.equal(current.secondaryIdleMediaPath, null);
    await store.update({ coinCount: 7 });
    const disk = JSON.parse(await fs.readFile(settingsFile(newRoot), 'utf8'));
    assert.equal(disk.applicationIconPath, `branding/${name}`);
    assert.equal(disk.secondaryDisplayBackgroundPath, 'branding/secondary-display-background-legacy.png');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('portable saves reject external paths and traversal without changing persisted or cached configuration', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'led-portable-boundary-'));
  try {
    const root = path.join(temporary, 'data');
    const store = storeFor(root);
    const original = await store.update({ applicationIconPath: 'branding/application-icon-safe.png', coinCount: 2 });
    const bytes = await fs.readFile(settingsFile(root));
    const invalid = [
      path.join(temporary, 'external', 'branding', 'application-icon-safe.png'),
      path.join(temporary, 'data-other', 'branding', 'application-icon-safe.png'),
      '../branding/application-icon-safe.png',
      'branding/../../branding/application-icon-safe.png',
      'branding/sub/application-icon-safe.png',
      'branding/./application-icon-safe.png',
      'branding/arbitrary.exe',
      'C:\\another-package\\data\\branding\\application-icon-safe.png',
      'branding\\..\\branding\\application-icon-safe.png',
      7,
    ];
    for (const value of invalid) {
      await assert.rejects(store.update({ applicationIconPath: value, coinCount: 8 }), /must refer to a managed file/);
      assert.deepEqual(await store.get(), original);
      assert.deepEqual(await fs.readFile(settingsFile(root)), bytes);
    }
    await assert.rejects(store.update({ secondaryIdleMediaPath: 'branding/secondary-idle-media-1.exe' }), /managed file/);
    await assert.rejects(store.update({ secondaryDisplayBackgroundPath: 'branding/application-icon-safe.png' }), /managed file/);
    const cleared = await store.update(Object.fromEntries(fields.map(field => [field, null])));
    const disk = JSON.parse(await fs.readFile(settingsFile(root), 'utf8'));
    for (const field of fields) {
      assert.equal(cleared[field], null);
      assert.equal(disk[field], null);
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
