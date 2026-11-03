import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
const { registerActivationIpc, createActivationIpcGate } = createRequire(import.meta.url)('../electron/game-activation.cjs');
const { verifyActivationPublicKey } = createRequire(import.meta.url)('../scripts/activation-release-check.cjs');

function fixture(backendRequest) {
  const handlers = new Map(), broadcasts = [], copied = [], focused = [], exits = [];
  const main = { sender: 'main' }, other = { sender: 'touch' };
  registerActivationIpc({ ipcMain: { handle: (key, value) => handlers.set(key, value) }, backendRequest,
    clipboard: { writeText: value => copied.push(value), readText: () => 'LGACT1.clipboard' },
    isMainSender: event => event === main, broadcast: value => broadcasts.push(value), restoreFocus: event => focused.push(event),
    exitUnactivated: async () => { exits.push('exit'); return true; } });
  return { call: (name, ...args) => handlers.get('activation:' + name)(...args), main, other, broadcasts, copied, focused, exits };
}

test('activation IPC waits for backend confirmation before broadcasting and never trusts a renderer status', async () => {
  const requests = [], state = { activated: true, machineCode: 'LGG1-' + 'A'.repeat(64) };
  let finish;
  const f = fixture((url, options) => { requests.push({ url, options }); return new Promise(resolve => { finish = resolve; }); });
  const pending = f.call('submit', f.main, 'LGACT1.input');
  assert.deepEqual(f.broadcasts, []);
  finish({ data: state });
  assert.deepEqual(await pending, { data: state });
  assert.deepEqual(f.broadcasts, [state]);
  assert.deepEqual(requests, [{ url: '/activation', options: { method: 'POST', body: '{"activationCode":"LGACT1.input"}' } }]);
});

test('activation and clipboard mutations reject non-main windows before requesting backend or clipboard', async () => {
  const f = fixture(() => { throw new Error('must not request'); });
  await assert.rejects(f.call('submit', f.other, 'code'), /管理员主窗口/);
  await assert.rejects(f.call('copy-machine', f.other), /管理员主窗口/);
  assert.throws(() => f.call('paste-code', f.other), /管理员主窗口/);
  assert.deepEqual(f.copied, []); assert.deepEqual(f.focused, []);
  await assert.rejects(f.call('submit', f.main, 'x'.repeat(16385)), /过长/);
  await assert.rejects(f.call('submit', f.main, { activated: true }), /激活码/);
});

test('machine copy uses fresh identity without native focus or window raising on success and failure', async () => {
  const state = { activated: false, machineCode: 'LGG1-' + 'B'.repeat(64) };
  const f = fixture(async url => { assert.equal(url, '/activation'); return { data: state }; });
  assert.deepEqual(await f.call('copy-machine', f.main), { data: state });
  assert.deepEqual(f.copied, [state.machineCode]);
  assert.equal(f.call('paste-code', f.main), 'LGACT1.clipboard');
  assert.deepEqual(f.focused, []);
  const bad = fixture(async () => ({ data: { machineCode: '', message: '机器码读取失败' } }));
  await assert.rejects(bad.call('copy-machine', bad.main), /机器码读取失败/);
  assert.deepEqual(bad.copied, []); assert.deepEqual(bad.focused, []);
});

test('unactivated exit is restricted to main window and uses normal application shutdown', async () => {
  const f = fixture(async () => ({ data: { activated: false } }));
  assert.throws(() => f.call('exit', f.other), /管理员主窗口/);
  assert.equal(await f.call('exit', f.main), true);
  assert.deepEqual(f.exits, ['exit']); assert.deepEqual(f.focused, []);
});

test('all business IPC including local files and future channels is rejected before side effects', async () => {
  const handlers = new Map(), sideEffects = [], calls = [];
  let activated = false;
  const ipc = createActivationIpcGate({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), on: () => {} },
    requireActivated: async () => { calls.push('check'); if (!activated) throw new Error('未激活'); },
  });
  const names = ['game:import', 'frame:export-json', 'media:list', 'media:open-folder', 'app-settings:update',
    'app-language:set', 'secondary-display:open', 'elc408:read-wiring', 'game:idle', 'some-future-business'];
  for (const name of names) {
    ipc.handle(name, () => sideEffects.push(name));
    await assert.rejects(handlers.get(name)({}), /未激活/);
  }
  assert.deepEqual(sideEffects, []); assert.equal(calls.length, names.length);
  activated = true; await handlers.get('game:import')({}); assert.deepEqual(sideEffects, ['game:import']);
  for (const name of ['activation:status', 'activation:submit', 'activation:copy-machine', 'activation:paste-code', 'activation:exit', 'backend:status', 'window:close', 'app-language:get']) {
    ipc.handle(name, () => 'bootstrap'); activated = false;
    assert.equal(await handlers.get(name)({}), 'bootstrap');
  }
});

test('invalid activation leaves status broadcasts unchanged and returns the actual backend error', async () => {
  const f = fixture(async () => { throw new Error('激活码不适用于游戏端'); });
  await assert.rejects(f.call('submit', f.main, 'member-code'), /不适用于游戏端/);
  assert.deepEqual(f.broadcasts, []);
});

test('release preparation rejects missing, private or wrong-algorithm trust material', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'game-activation-public-'));
  try {
    const dir = path.join(root, 'src/main/resources'); await mkdir(dir, { recursive: true });
    const file = path.join(dir, 'activation-public.pem');
    assert.throws(() => verifyActivationPublicKey(root), /缺少厂家授权公钥/);
    const keys = generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    await writeFile(file, keys.privateKey); assert.throws(() => verifyActivationPublicKey(root), /只能打包厂家公钥/);
    const wrong = generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' } });
    await writeFile(file, wrong.publicKey); assert.throws(() => verifyActivationPublicKey(root), /必须是 Ed25519/);
    await writeFile(file, keys.publicKey); assert.equal(verifyActivationPublicKey(root), file);
  } finally { await rm(root, { recursive: true, force: true }); }
});
