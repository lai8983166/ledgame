import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const { resolveActivationStorage } = require('../electron/activation-storage.cjs')
const { createBackendEnvironment } = require('../electron/backend-protection.cjs')

function appAt(packageRoot) {
  const paths = {
    userData: path.resolve(packageRoot, 'data'),
    appData: path.resolve('machine-user', 'Roaming'),
    home: path.resolve('machine-user'),
  }
  return { getPath: name => paths[name] }
}

test('different and moved packages share the fixed machine-user authorization directory only', () => {
  const a = resolveActivationStorage({ app: appAt('package-a'), env: {} })
  const b = resolveActivationStorage({ app: appAt('package-b'), env: {} })
  const moved = resolveActivationStorage({ app: appAt('moved-package'), env: {} })
  const expected = path.resolve('machine-user', 'Roaming', 'led-game', 'activation')
  for (const result of [a, b, moved]) assert.equal(result.directory, expected)
  assert.ok(a.legacyDirectories.includes(path.resolve('package-a', 'data', 'activation')))
  assert.ok(b.legacyDirectories.includes(path.resolve('package-b', 'data', 'activation')))
  assert.ok(moved.legacyDirectories.includes(path.resolve('moved-package', 'data', 'activation')))
  assert.ok(a.legacyDirectories.includes(path.resolve('machine-user', '.ledgame-game', 'activation')))
  assert.equal(b.legacyDirectories.includes(path.resolve('package-a', 'data', 'activation')), false)
  assert.equal(a.legacyDirectories.includes(expected), false)
})

test('legacy roaming profile does not include the canonical authorization directory as a migration source', () => {
  const app = appAt('unused')
  const originalGetPath = app.getPath
  app.getPath = name => name === 'userData'
    ? path.resolve('machine-user', 'Roaming', 'led-game') : originalGetPath(name)
  const result = resolveActivationStorage({ app, env: {} })
  assert.deepEqual(result.legacyDirectories, [path.resolve('machine-user', '.ledgame-game', 'activation')])
})

test('explicit isolated profile never consults the real user authorization or legacy directories', () => {
  const isolated = path.resolve('isolated-fixture')
  const app = { getPath: name => {
    assert.equal(name, 'userData', 'isolated launches must not consult appData or home')
    return isolated
  } }
  assert.deepEqual(resolveActivationStorage({ app, env: { LED_USER_DATA_DIR: isolated } }), {
    directory: path.join(isolated, 'activation'), legacyDirectories: [],
  })
  assert.deepEqual(resolveActivationStorage({ app, env: { LED_USER_DATA_DIR: ` ${isolated} ` } }), {
    directory: path.join(isolated, 'activation'), legacyDirectories: [],
  })
})

test('whitespace-only override keeps the normal fixed authorization directory', () => {
  assert.deepEqual(resolveActivationStorage({ app: appAt('package-a'), env: { LED_USER_DATA_DIR: '  ' } }),
    resolveActivationStorage({ app: appAt('package-a'), env: {} }))
})

test('main passes trusted fixed and legacy paths to the backend without forwarding inherited authorization paths', () => {
  const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8')
  const resolved = main.match(/const activationStorage = resolveActivationStorage\(\{ app \}\)/)?.[0]
  assert.ok(resolved, 'embedded backend must resolve the authorization paths explicitly')
  const values = main.match(/LED_ACTIVATION_DIRECTORY: [^\r\n]+\r?\n\s*LED_ACTIVATION_LEGACY_DIRECTORIES: [^\r\n]+/)?.[0]
  assert.ok(values, 'embedded backend must supply canonical and migration directories')
  const actual = vm.runInNewContext(`${resolved}; ({ ${values} })`, {
    app: appAt('package-a'), resolveActivationStorage: options => resolveActivationStorage({ ...options, env: {} }),
  })
  const expected = resolveActivationStorage({ app: appAt('package-a'), env: {} })
  assert.equal(actual.LED_ACTIVATION_DIRECTORY, expected.directory)
  assert.deepEqual(JSON.parse(actual.LED_ACTIVATION_LEGACY_DIRECTORIES), expected.legacyDirectories)
  const child = createBackendEnvironment({
    env: { LED_ACTIVATION_DIRECTORY: 'inherited-untrusted', LED_ACTIVATION_LEGACY_DIRECTORIES: '["untrusted"]' },
    values: actual,
  })
  assert.equal(child.LED_ACTIVATION_DIRECTORY, expected.directory)
  assert.equal(child.LED_ACTIVATION_LEGACY_DIRECTORIES, JSON.stringify(expected.legacyDirectories))
})
