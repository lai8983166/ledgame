import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const { configureDataDirectory, resolveDataDirectory } = require('../electron/portable-data.cjs')
const { executableStartsGame, gameExecutableName } = require('../electron/game-launch.cjs')

function appFixture(root, isPackaged = true) {
  const paths = { exe: path.join(root, 'LED Game.exe'), userData: path.join(root, '..', 'old-roaming') }
  const writes = []
  return { isPackaged, paths, writes, getPath: key => paths[key], setPath: (key, value) => {
    paths[key] = value
    writes.push(key)
  } }
}

test('two package directories own independent data and sessions regardless of working directory', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'led-portable-data-'))
  try {
    const a = appFixture(path.join(temporary, 'package-a'))
    const b = appFixture(path.join(temporary, 'package-b'))
    for (const app of [a, b]) {
      const root = configureDataDirectory({ app, fs, env: {} })
      assert.equal(root, path.join(path.dirname(app.paths.exe), 'data'))
      assert.equal(app.paths.sessionData, path.join(root, 'session'))
      assert.ok(fs.statSync(app.paths.sessionData).isDirectory())
      assert.deepEqual(fs.readdirSync(root), ['session'])
    }
    fs.writeFileSync(path.join(a.paths.userData, 'settings.json'), '{"coinCount":3}')
    assert.equal(fs.existsSync(path.join(b.paths.userData, 'settings.json')), false)
    const fromOtherWorkingDirectory = resolveDataDirectory({
      isPackaged: true, executablePath: a.paths.exe, defaultUserDataPath: process.cwd(),
    })
    assert.equal(fromOtherWorkingDirectory, a.paths.userData)
    const moved = appFixture(path.join(temporary, 'moved-package'))
    fs.cpSync(path.dirname(a.paths.exe), path.dirname(moved.paths.exe), { recursive: true })
    configureDataDirectory({ app: moved, fs, env: {} })
    assert.equal(fs.readFileSync(path.join(moved.paths.userData, 'settings.json'), 'utf8'), '{"coinCount":3}')
    assert.notEqual(moved.paths.userData, a.paths.userData)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('explicit isolated data override applies to packaged and development launches', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'led-portable-override-'))
  try {
    for (const isPackaged of [true, false]) {
      const app = appFixture(path.join(temporary, isPackaged ? 'package' : 'source'), isPackaged)
      const override = path.join(temporary, isPackaged ? 'isolated-package' : 'isolated-source')
      assert.equal(configureDataDirectory({ app, fs, env: { LED_USER_DATA_DIR: override } }), override)
      assert.equal(app.paths.userData, override)
      assert.equal(app.paths.sessionData, path.join(override, 'session'))
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('development without an override retains Electron paths without filesystem writes', () => {
  const app = appFixture(path.resolve('source'), false)
  const original = app.paths.userData
  const noWrites = new Proxy({}, { get: () => assert.fail('development must not initialize a portable data directory') })
  assert.equal(configureDataDirectory({ app, fs: noWrites, env: {} }), original)
  assert.deepEqual(app.writes, [])
})

test('unwritable package data fails explicitly without selecting a roaming fallback', () => {
  const app = appFixture(path.resolve('locked-package'))
  const original = app.paths.userData
  const cause = Object.assign(new Error('Permission denied'), { code: 'EACCES' })
  const denied = { mkdirSync() {}, writeFileSync() { throw cause }, unlinkSync() { assert.fail('uncreated probe must not be removed') } }
  assert.throws(() => configureDataDirectory({ app, fs: denied, env: {} }), error => {
    assert.equal(error.code, 'DATA_DIRECTORY_UNAVAILABLE')
    assert.equal(error.cause, cause)
    assert.ok(error.message.includes(path.join(path.dirname(app.paths.exe), 'data')))
    return true
  })
  assert.equal(app.paths.userData, original)
  assert.deepEqual(app.writes, [])
})

test('an existing file in place of data is not overwritten', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'led-portable-file-'))
  try {
    const app = appFixture(temporary)
    fs.writeFileSync(path.join(temporary, 'data'), 'preserve this file')
    assert.throws(() => configureDataDirectory({ app, fs, env: {} }), { code: 'DATA_DIRECTORY_UNAVAILABLE' })
    assert.equal(fs.readFileSync(path.join(temporary, 'data'), 'utf8'), 'preserve this file')
    assert.deepEqual(app.writes, [])
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const bootstrap = main.slice(main.indexOf('try {\n  configureDataDirectory'), main.indexOf('const languagePreferences'))

test('storage is established before the single-instance lock so separate copies use separate locks', () => {
  const attempts = [], locks = new Set()
  const run = (location, play = false) => {
    const app = appFixture(path.resolve(location))
    if (play) app.paths.exe = path.join(path.resolve(location), gameExecutableName)
    app.requestSingleInstanceLock = ({ enterGame }) => {
      attempts.push([app.paths.userData, enterGame])
      const duplicate = locks.has(app.paths.userData)
      locks.add(app.paths.userData)
      return !duplicate
    }
    app.quit = () => attempts.push('quit')
    const fsStub = { mkdirSync() {}, writeFileSync() {}, unlinkSync() {} }
    vm.runInNewContext(`(function() { ${bootstrap} })()`, {
      app, executableStartsGame, nodeFs: fsStub,
      configureDataDirectory: options => configureDataDirectory({ ...options, env: {} }),
    })
  }
  run('package-one')
  run('package-two', true)
  run('package-one', true)
  assert.deepEqual(attempts, [
    [path.resolve('package-one/data'), false],
    [path.resolve('package-two/data'), true],
    [path.resolve('package-one/data'), true],
    'quit',
  ])
})

test('storage failure reports and exits without acquiring the lock or continuing startup', async () => {
  const calls = []
  const app = {
    whenReady: () => { calls.push('ready'); return Promise.resolve() },
    exit: code => calls.push(['exit', code]),
    requestSingleInstanceLock: () => assert.fail('must not acquire a lock after storage failure'),
  }
  vm.runInNewContext(`(function() { ${bootstrap}\n throw new Error('startup continued') })()`, {
    app, nodeFs: {}, configureDataDirectory: () => { throw new Error('unwritable package/data') },
    dialog: { showErrorBox: (...args) => calls.push(args) },
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls, ['ready', ['LED Game 数据目录不可用', 'unwritable package/data'], ['exit', 1]])
})
