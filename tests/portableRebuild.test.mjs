import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { rebuildPortable, preservedFingerprint, publishArchive, buildRelease } = require('../scripts/portable-rebuild.cjs')

function write(root, relative, content) {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function fixture(t, { existing = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'led-portable-rebuild-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, 'release', 'win-unpacked')
  write(root, 'package.json', '{}')
  write(root, 'electron-builder.json', JSON.stringify({
    directories: { output: 'release' },
    extraResources: [{ from: 'defaults/media', to: 'media' }, { from: 'defaults/seed-database', to: 'seed-database' }],
    extraFiles: [{ from: 'defaults/elc408', to: 'elc408' }],
  }))
  write(root, 'defaults/media/factory.mp4', 'factory-media')
  write(root, 'defaults/seed-database/runtime/ledgame.mv.db', 'factory-db')
  write(root, 'defaults/elc408/conf.json', 'factory-controller')
  if (existing) {
    write(source, 'LED Game.exe', 'old-program')
    write(source, 'data/database/runtime/ledgame.mv.db', 'edited-games-and-spirits')
    write(source, 'data/database/backups/saved.mv.db', 'saved-backup')
    write(source, 'data/settings/application.json', '{"coinCount":7}')
    write(source, 'data/settings/language.json', 'en-US')
    write(source, 'data/branding/application-icon-user.png', 'user-icon')
    write(source, 'data/branding/secondary-display-background-user.png', 'user-background')
    write(source, 'data/branding/secondary-idle-media-user.mp4', 'user-idle')
    write(source, 'data/activation/license.json', 'keep-private-on-this-machine')
    write(source, 'data/logs/startup.log', 'old-log')
    write(source, 'data/session/Preferences', 'old-cache')
    write(source, 'resources/media/user.mp4', 'user-media')
    write(source, 'elc408/conf.json', 'user-controller')
    write(source, 'elc408/wiring.json', 'user-wiring')
  }
  return { root, source }
}

function fileList(directory, relative = '') {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory).sort().flatMap(name => {
    const file = path.join(directory, name)
    const item = relative ? `${relative}/${name}` : name
    return fs.statSync(file).isDirectory() ? fileList(file, item) : [item]
  })
}

async function fakeBuild({ projectRoot, config, targets }) {
  const app = path.join(config.directories.output, 'win-unpacked')
  write(app, 'LED Game.exe', 'new-program')
  write(app, 'LED Game Play.exe', 'new-play-program')
  for (const [entries, prefix] of [[config.extraResources, 'resources'], [config.extraFiles, '']]) {
    for (const entry of entries) {
      const from = path.resolve(projectRoot, entry.from)
      if (fs.existsSync(from)) fs.cpSync(from, path.join(app, prefix, entry.to), { recursive: true })
    }
  }
  if (targets.includes('zip')) write(config.directories.output, 'LED Game-test-win.zip', JSON.stringify(fileList(app)))
}

const noProcesses = () => []
const noPreparation = () => {}
const verify = directory => {
  assert.equal(fs.readFileSync(path.join(directory, 'LED Game.exe'), 'utf8'), 'new-program')
  assert.equal(fs.readFileSync(path.join(directory, 'LED Game Play.exe'), 'utf8'), 'new-play-program')
}
const verifyArchive = archive => {
  const entries = JSON.parse(fs.readFileSync(archive, 'utf8'))
  for (const name of ['LED Game.exe', 'LED Game Play.exe']) {
    assert.ok(entries.includes(name), `Missing ${name} in ZIP`)
  }
}
const run = (fixture, options = {}) => rebuildPortable({ projectRoot: fixture.root,
  probe: noProcesses, prepare: noPreparation, build: fakeBuild, verify, verifyArchive, ...options })

test('rebuilding retains edited data and resources, while ZIP excludes machine license and temporary data', async t => {
  const current = fixture(t)
  const before = await preservedFingerprint(current.source)
  const result = await run(current)
  assert.equal(result.passed, true)
  assert.deepEqual(await preservedFingerprint(current.source), before)
  assert.equal(fs.readFileSync(path.join(current.source, 'LED Game.exe'), 'utf8'), 'new-program')
  assert.equal(fs.readFileSync(path.join(current.source, 'LED Game Play.exe'), 'utf8'), 'new-play-program')
  const archived = JSON.parse(fs.readFileSync(result.archives[0], 'utf8'))
  for (const required of ['data/database/runtime/ledgame.mv.db', 'data/database/backups/saved.mv.db',
    'data/settings/application.json', 'data/settings/language.json',
    'data/branding/application-icon-user.png', 'data/branding/secondary-display-background-user.png',
    'data/branding/secondary-idle-media-user.mp4', 'resources/media/user.mp4', 'elc408/conf.json']) {
    assert.ok(archived.includes(required), required)
  }
  assert.equal(archived.some(item => /^data\/(activation|logs|session)\//.test(item)), false)
  assert.equal(archived.includes('resources/media/factory.mp4'), false)
  assert.equal(fs.readFileSync(path.join(result.work, 'snapshot/data/activation/license.json'), 'utf8'), 'keep-private-on-this-machine')
  assert.ok(fs.existsSync(path.join(result.work, 'snapshot-manifest.json')))
})

test('a first build uses seed media and controller defaults without borrowing other data', async t => {
  const current = fixture(t, { existing: false })
  const result = await run(current)
  assert.equal(fs.existsSync(path.join(current.source, 'data')), false)
  assert.equal(fs.readFileSync(path.join(current.source, 'resources/media/factory.mp4'), 'utf8'), 'factory-media')
  assert.equal(fs.readFileSync(path.join(current.source, 'resources/seed-database/runtime/ledgame.mv.db'), 'utf8'), 'factory-db')
  assert.equal(fs.readFileSync(path.join(current.source, 'elc408/conf.json'), 'utf8'), 'factory-controller')
  assert.deepEqual(result.preserved, [])
})

test('intentionally empty old media and controller directories remain authoritative', async t => {
  const current = fixture(t)
  fs.unlinkSync(path.join(current.source, 'resources/media/user.mp4'))
  fs.unlinkSync(path.join(current.source, 'elc408/conf.json'))
  fs.unlinkSync(path.join(current.source, 'elc408/wiring.json'))
  await run(current)
  assert.deepEqual(fs.readdirSync(path.join(current.source, 'resources/media')), [])
  assert.deepEqual(fs.readdirSync(path.join(current.source, 'elc408')), [])
})

test('build failures leave the original program and all customer data intact with a recovery snapshot', async t => {
  const current = fixture(t)
  const before = await preservedFingerprint(current.source)
  await assert.rejects(run(current, { build: () => { throw new Error('builder failed') } }), /builder failed/)
  assert.deepEqual(await preservedFingerprint(current.source), before)
  assert.equal(fs.readFileSync(path.join(current.source, 'LED Game.exe'), 'utf8'), 'old-program')
  const work = path.join(current.root, '.build', fs.readdirSync(path.join(current.root, '.build'))[0])
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'result.json'))).passed, false)
  assert.deepEqual(await preservedFingerprint(path.join(work, 'snapshot')), before)
  assert.equal(fs.existsSync(path.join(current.root, 'release/.portable-rebuild.lock')), false)
})

test('active package processes are rejected before prepare or snapshotting an open H2 database', async t => {
  const current = fixture(t)
  const before = await preservedFingerprint(current.source)
  await assert.rejects(run(current, { probe: () => [{ ProcessId: 123 }], prepare: () => assert.fail('must not prepare') }),
    { code: 'PORTABLE_PACKAGE_RUNNING' })
  assert.deepEqual(await preservedFingerprint(current.source), before)
  assert.deepEqual(fs.readdirSync(path.join(current.root, '.build')), [])
})

test('data changed during building aborts publication and preserves the newer user edit', async t => {
  const current = fixture(t)
  await assert.rejects(run(current, { build: async options => {
    await fakeBuild(options)
    write(current.source, 'data/settings/application.json', '{"coinCount":9}')
  } }), /构建期间发生变化/)
  assert.equal(fs.readFileSync(path.join(current.source, 'data/settings/application.json'), 'utf8'), '{"coinCount":9}')
  assert.equal(fs.readFileSync(path.join(current.source, 'LED Game.exe'), 'utf8'), 'old-program')
})

test('a package started during building aborts publication even if its data has not changed yet', async t => {
  const current = fixture(t)
  let checks = 0
  await assert.rejects(run(current, { probe: () => ++checks === 1 ? [] : [{ ProcessId: 456 }] }),
    { code: 'PORTABLE_PACKAGE_RUNNING' })
  assert.equal(fs.readFileSync(path.join(current.source, 'LED Game.exe'), 'utf8'), 'old-program')
})

test('staged files must actually match saved customer data before replacing the program', async t => {
  const current = fixture(t)
  await assert.rejects(run(current, { build: async options => {
    await fakeBuild(options)
    write(path.join(options.config.directories.output, 'win-unpacked'), 'data/settings/application.json', '{}')
  } }), /did not preserve data\/settings/)
  assert.equal(fs.readFileSync(path.join(current.source, 'LED Game.exe'), 'utf8'), 'old-program')
})

test('a ZIP missing the play executable is rejected before replacing either release artifact', async t => {
  const current = fixture(t)
  const previousArchive = path.join(current.root, 'release', 'LED Game-test-win.zip')
  fs.writeFileSync(previousArchive, 'previous ZIP')
  await assert.rejects(run(current, { build: async options => {
    await fakeBuild(options)
    write(options.config.directories.output, 'LED Game-test-win.zip', JSON.stringify(['LED Game.exe']))
  } }), /Missing LED Game Play\.exe in ZIP/)
  assert.equal(fs.readFileSync(path.join(current.source, 'LED Game.exe'), 'utf8'), 'old-program')
  assert.equal(fs.readFileSync(previousArchive, 'utf8'), 'previous ZIP')
})

test('directory-only target retains live data but does not regenerate or overwrite an existing ZIP', async t => {
  const current = fixture(t)
  write(current.root, 'release/previous.zip', 'previous-archive')
  const result = await run(current, { target: 'dir' })
  assert.deepEqual(result.archives, [])
  assert.equal(fs.readFileSync(path.join(current.root, 'release/previous.zip'), 'utf8'), 'previous-archive')
})

test('linked source directories and output paths outside the project are rejected', async t => {
  const current = fixture(t)
  write(current.root, 'outside-preserved/sensitive.txt', 'never-follow')
  try {
    fs.symlinkSync(path.join(current.root, 'outside-preserved'), path.join(current.source, 'data/linked'),
      process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('symlink creation unavailable')
    throw error
  }
  await assert.rejects(run(current), /refuses linked paths/)
  assert.equal(fs.readFileSync(path.join(current.root, 'outside-preserved/sensitive.txt'), 'utf8'), 'never-follow')
  write(current.root, 'electron-builder.json', JSON.stringify({ directories: { output: '../outside-release' } }))
  await assert.rejects(run(current), /must remain inside/)
})

test('ZIP publication retains the previous archive when copying is interrupted', t => {
  const current = fixture(t)
  const original = path.join(current.root, 'release', 'LED Game-win.zip')
  const staged = path.join(current.root, 'validated-new.zip')
  fs.writeFileSync(original, 'previous-valid-archive')
  fs.writeFileSync(staged, 'new-valid-archive')
  assert.throws(() => publishArchive(staged, original, { copy: (_source, temporary) => {
    fs.writeFileSync(temporary, 'interrupted-partial-copy')
    throw Object.assign(new Error('disk full during copy'), { code: 'ENOSPC' })
  } }), /disk full/)
  assert.equal(fs.readFileSync(original, 'utf8'), 'previous-valid-archive')
  assert.equal(fs.readFileSync(staged, 'utf8'), 'new-valid-archive')
  publishArchive(staged, original)
  assert.equal(fs.readFileSync(original, 'utf8'), 'new-valid-archive')
})

test('a resources junction cannot redirect preservation or publication outside the package', async t => {
  const current = fixture(t)
  const external = path.join(current.root, 'external-resources')
  write(external, 'media/private.mp4', 'do-not-read-or-overwrite')
  fs.unlinkSync(path.join(current.source, 'resources/media/user.mp4'))
  fs.rmdirSync(path.join(current.source, 'resources/media'))
  fs.rmdirSync(path.join(current.source, 'resources'))
  try {
    fs.symlinkSync(external, path.join(current.source, 'resources'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('symlink creation unavailable')
    throw error
  }
  await assert.rejects(run(current), /refuses linked paths/)
  assert.equal(fs.readFileSync(path.join(external, 'media/private.mp4'), 'utf8'), 'do-not-read-or-overwrite')
  assert.equal(fs.readFileSync(path.join(current.source, 'LED Game.exe'), 'utf8'), 'old-program')
})

test('a release root junction is rejected before creating locks or writing external files', async t => {
  const current = fixture(t, { existing: false })
  const external = path.join(current.root, 'external-release')
  fs.mkdirSync(external)
  try {
    fs.symlinkSync(external, path.join(current.root, 'release'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('symlink creation unavailable')
    throw error
  }
  await assert.rejects(run(current), /requires a real directory|refuses linked paths/)
  assert.deepEqual(fs.readdirSync(external), [])
})

test('builder loads the generated complete config once without adding the old default resource sources', async t => {
  const current = fixture(t)
  const work = path.join(current.root, '.build', 'single-config')
  fs.mkdirSync(work, { recursive: true })
  const config = { directories: { output: path.join(work, 'output') },
    extraResources: [{ from: path.join(work, 'snapshot', 'media'), to: 'media' }],
    extraFiles: [{ from: path.join(work, 'snapshot', 'elc408'), to: 'elc408' }],
  }
  let configPath
  await buildRelease({ projectRoot: current.root, config, targets: ['dir', 'zip'] }, {
    run: (node, args, options) => {
      assert.equal(node, process.execPath)
      configPath = args[args.indexOf('--config') + 1]
      assert.equal(args.filter(arg => arg === '--config').length, 1)
      assert.deepEqual(args.slice(args.indexOf('--win') + 1), ['dir', 'zip'])
      assert.equal(options.cwd, current.root)
      assert.deepEqual(JSON.parse(fs.readFileSync(configPath)), config)
    },
  })
  const builderRequire = createRequire(require.resolve('electron-builder'))
  const packagerRequire = createRequire(builderRequire.resolve('app-builder-lib'))
  const { getConfig } = packagerRequire('./util/config/config.js')
  const effective = await getConfig(current.root, configPath, undefined)
  assert.deepEqual(effective.extraResources, config.extraResources)
  assert.deepEqual(effective.extraFiles, config.extraFiles)
  assert.equal(effective.extraResources.length, 1)
  assert.equal(effective.extraResources[0].from.includes('defaults'), false)
})

test('a failed builder child propagates its failure and leaves the original package unchanged', async t => {
  const current = fixture(t)
  const before = await preservedFingerprint(current.source)
  const failingCli = path.join(current.root, 'failing-builder.cjs')
  fs.writeFileSync(failingCli, 'process.exit(23)\n')
  await assert.rejects(run(current, {
    build: options => buildRelease(options, {
      cli: failingCli,
      run: (node, args, options) => execFileSync(node, args, { ...options, stdio: 'ignore' }),
    }),
  }), error => error.status === 23)
  assert.deepEqual(await preservedFingerprint(current.source), before)
  assert.equal(fs.readFileSync(path.join(current.source, 'LED Game.exe'), 'utf8'), 'old-program')

  const work = path.join(current.root, '.build', 'exit-status')
  fs.mkdirSync(work)
  const modulePath = require.resolve('../scripts/portable-rebuild.cjs')
  const script = `require(${JSON.stringify(modulePath)}).buildRelease({projectRoot:${JSON.stringify(current.root)},config:{directories:{output:${JSON.stringify(path.join(work, 'output'))}}},targets:['dir']},{cli:${JSON.stringify(failingCli)}}).catch(()=>{process.exitCode=1})`
  const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', windowsHide: true })
  assert.equal(child.status, 1, 'The parent command must retain a nonzero status after the failed builder exits')
})
