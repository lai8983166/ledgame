import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const { createLibraryFolder, importMediaFiles, resolveLibraryFolder } = createRequire(import.meta.url)('../electron/media-library-import.cjs');
const supported = name => /\.(png|mp3|mp4)$/i.test(name);
async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'led-media-import-'));
  t.after(() => rm(temporary, { recursive:true, force:true }));
  const root = path.join(temporary, 'media'), source = path.join(temporary, 'photo.png');
  await mkdir(root); await writeFile(source, 'image-source');
  return { temporary, root, source };
}
test('imports copies into nested folders without overwriting and preserves original files', async t => {
  const { root, source } = await fixture(t);
  assert.equal((await createLibraryFolder(root, '', '一级')).relativePath, '一级');
  await createLibraryFolder(root, '一级', '二级');
  let result = await importMediaFiles(root, '一级/二级', [source], supported);
  assert.deepEqual(result.imported, ['一级/二级/photo.png']);
  await writeFile(source, 'changed-source');
  result = await importMediaFiles(root, '一级/二级', [source], supported);
  assert.deepEqual(result.imported, ['一级/二级/photo (1).png']);
  assert.equal(await readFile(path.join(root, '一级/二级/photo.png'), 'utf8'), 'image-source');
  assert.equal(await readFile(path.join(root, '一级/二级/photo (1).png'), 'utf8'), 'changed-source');
  assert.equal(await readFile(source, 'utf8'), 'changed-source');
  await assert.rejects(createLibraryFolder(root, '', '一级'), { code:'EEXIST' });
});
test('empty selection performs no writes, invalid sources reject before any copying', async t => {
  const { root, source, temporary } = await fixture(t);
  assert.deepEqual(await importMediaFiles(root, '', [], supported), { imported:[], failures:[] });
  const invalid = path.join(temporary, 'wrong.exe'); await writeFile(invalid, 'not-media');
  await assert.rejects(importMediaFiles(root, '', [source, invalid], supported), /图片、音频或视频/);
  await assert.rejects(importMediaFiles(root, '', [path.join(temporary, 'missing.png')], supported));
  assert.deepEqual(await readdir(root), []);
});
test('rejects traversal, absolute directories, invalid Windows folder names and file-as-directory', async t => {
  const { root, temporary } = await fixture(t);
  for (const name of ['..', '.hidden', 'a/b', 'a\\b', 'a:stream', 'CON', 'NUL.txt', 'LPT1', 'end.', ' ', 'a*']) {
    await assert.rejects(createLibraryFolder(root, '', name));
  }
  for (const folder of ['../outside', 'a/../b', '/outside', 'C:\\outside']) {
    await assert.rejects(resolveLibraryFolder(root, folder));
  }
  await writeFile(path.join(root, 'file'), 'x');
  await assert.rejects(createLibraryFolder(root, 'file', 'child'), /文件夹/);
  assert.deepEqual((await readdir(temporary)).sort(), ['media','photo.png']);
});
test('escaping directory junction cannot be an upload or folder-creation destination', async t => {
  const { root, temporary, source } = await fixture(t);
  const outside = path.join(temporary, 'outside'); await mkdir(outside);
  await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(importMediaFiles(root, 'escape', [source], supported), /超出/);
  await assert.rejects(createLibraryFolder(root, 'escape', 'child'), /超出/);
  assert.deepEqual(await readdir(outside), []);
});
