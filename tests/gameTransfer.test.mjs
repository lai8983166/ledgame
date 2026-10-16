import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import transfer from '../electron/game-transfer.cjs';

test('packaged H2 commits are flushed before success, not delayed past application exit', async () => {
  const source = await fs.readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.match(source, /SPRING_DATASOURCE_URL:.*WRITE_DELAY=0/);
});

test('export preserves complete raw row, is atomic, and never writes on cancel', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'game-transfer-'));
  try {
    const file = path.join(dir, 'game.json');
    const row = { id: 5, type: 'default', levels: '[{"frameList":[]}]', wiringDataBak: 'raw', cover: null };
    await transfer.exportGameRecord({ id: 5, request: async () => ({ data: row }), chooseFile: async () => ({ canceled: true }) });
    assert.deepEqual(await fs.readdir(dir), []);
    await transfer.exportGameRecord({ id: 5, request: async () => ({ data: row }), chooseFile: async () => ({ filePath: file }) });
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), row);
    assert.deepEqual(await fs.readdir(dir), ['game.json']);
    await assert.rejects(transfer.exportGameRecord({ id: 5, request: async () => ({ data: row }), chooseFile: async () => ({ filePath: file }), io: { ...fs, rename: async () => { throw new Error('disk'); } } }));
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), row);
    assert.deepEqual(await fs.readdir(dir), ['game.json']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('import chooses file after family, rejects wrong shapes and submits the whole row', async () => {
  let requests = 0, selections = 0;
  const chooseFile = async () => { selections++; return { filePaths: ['test.json'] }; };
  const options = { family: 'entertainment', chooseFile, request: async (url, init) => {
    requests++; assert.equal(url, '/games/import'); assert.equal(JSON.parse(init.body).game.wiringDataBak, 'raw'); return { data: { id: 99 } };
  }, io: { stat: async () => ({ isFile: () => true, size: 123 }), readFile: async () => '\uFEFF' + JSON.stringify({ type: 'default', levels: '[]', wiringDataBak: 'raw' }) } };
  await assert.rejects(transfer.importGameRecord({ ...options, family: 'multidimensional' }));
  assert.equal(selections, 0);
  assert.equal((await transfer.importGameRecord(options)).game.id, 99);
  for (const text of ['{', '[]', '{}', '{"levels":[]}']) {
    await assert.rejects(transfer.importGameRecord({ ...options, io: { ...options.io, readFile: async () => text } }));
  }
  assert.equal(requests, 1);
  assert.deepEqual(await transfer.importGameRecord({ ...options, chooseFile: async () => ({ canceled: true }) }), { canceled: true });
  assert.equal(requests, 1);
});
