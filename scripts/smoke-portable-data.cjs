const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
const { createRequire } = require('node:module')
const { windowsSystemEnvironment } = require('../electron/backend-protection.cjs')
const { verifyPortableProtection } = require('./verify-portable-protection.cjs')

const root = path.resolve(__dirname, '..')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const slash = value => value.replace(/\\/g, '/').toLowerCase()
const resourceNames = {
  applicationIconPath: 'application-icon-portable-smoke.png',
  secondaryDisplayBackgroundPath: 'secondary-display-background-portable-smoke.png',
  secondaryIdleMediaPath: 'secondary-idle-media-portable-smoke.png',
}

async function smokePortableData(directory) {
  assert.equal(process.platform, 'win32', 'This acceptance runs the Windows release executable')
  directory = path.resolve(directory)
  await verifyPortableProtection(directory)
  fs.mkdirSync(path.join(root, '.build'), { recursive: true })
  const work = fs.mkdtempSync(path.join(root, '.build', 'portable-data-smoke-'))
  const system = windowsSystemEnvironment(process.report.getReport())
  const summary = { package: directory, work, passed: false, checks: [] }
  const runs = new Set()
  let sequence = 0
  const builderRequire = createRequire(require.resolve('electron-builder'))
  const packagingRequire = createRequire(builderRequire.resolve('app-builder-lib'))
  const asar = packagingRequire('@electron/asar')
  const unzipper = packagingRequire('unzipper')
  const packageA = path.join(work, 'package-a')
  const packageB = path.join(work, 'package-b')
  const packageC = path.join(work, 'copied-package-c')
  const cwd = path.join(work, 'unrelated-working-directory')
  fs.mkdirSync(cwd)

  function copyPackage(source, target, includeData = false) {
    fs.cpSync(source, target, { recursive: true, filter: entry => {
      const relative = path.relative(source, entry).split(path.sep)
      // Never copy release-directory runtime data, a customer's activation,
      // media or hardware setup into this disposable acceptance fixture.
      if (!includeData && relative[0] === 'data') return false
      if (relative[0] === 'elc408') return false
      if (relative[0] === 'resources' && ['media', 'seed-database'].includes(relative[1])) return false
      // Chromium cache/session files are not application data or settings.
      return !(includeData && relative[0] === 'data' && relative[1] === 'session')
    } })
  }

  function launch(appDirectory) {
    const data = path.join(appDirectory, 'data')
    const logPath = path.join(data, 'logs', 'startup.log')
    const offset = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0
    const output = fs.openSync(path.join(work, `${path.basename(appDirectory)}-${++sequence}.console.log`), 'w')
    const env = { ...process.env, ...system, ELC408_ENABLED: 'false', LED_ROOM_CONNECTION_ENABLED: 'false' }
    delete env.LED_USER_DATA_DIR
    const child = spawn(path.join(appDirectory, 'LED Game.exe'), [], {
      cwd, env, windowsHide: true, stdio: ['ignore', output, output],
    })
    fs.closeSync(output)
    const run = { child, appDirectory, data, logPath, error: null,
      log: () => fs.existsSync(logPath) ? fs.readFileSync(logPath).subarray(offset).toString('utf8') : '',
    }
    child.once('error', error => { run.error = error })
    runs.add(run)
    return run
  }

  async function until(run, predicate, timeout = 60000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (run.error) throw run.error
      if (await predicate()) return
      if (run.child.exitCode !== null || run.child.signalCode !== null) {
        throw new Error(`${path.basename(run.appDirectory)} exited before its expected state; see ${work}`)
      }
      if (/Backend startup failed|Embedded backend exited/.test(run.log())) {
        throw new Error(`${path.basename(run.appDirectory)} backend failed; see ${work}`)
      }
      await pause(200)
    }
    throw new Error(`${path.basename(run.appDirectory)} timed out; see ${work}`)
  }

  async function ready(run) {
    await until(run, () => run.log().includes('Embedded backend is ready'))
    run.port = Number(run.log().match(/Embedded backend selected port (\d+)/)?.[1])
    assert.ok(run.port > 0)
    const database = path.join(run.data, 'database', 'runtime', 'ledgame')
    assert.ok(fs.statSync(`${database}.mv.db`).size > 0, 'The current package must own a real H2 database')
    const backendLog = fs.readFileSync(path.join(run.data, 'logs', 'backend.log'), 'utf8')
    assert.ok(slash(backendLog).includes(`url=jdbc:h2:file:${slash(database)}`),
      'The real embedded backend must connect to the database in its own package')
    const activation = await (await fetch(`http://127.0.0.1:${run.port}/activation`)).json()
    assert.equal(activation.data.activated, false)
    assert.match(activation.data.machineCode, /^LGG1-[A-F0-9]{64}$/)
    assert.equal((await fetch(`http://127.0.0.1:${run.port}/game-categories`)).status, 403)
    return run
  }

  async function stop(run) {
    if (!runs.has(run)) return
    if (run.child.exitCode === null && run.child.signalCode === null) {
      try {
        execFileSync(path.join(system.SYSTEMROOT, 'System32', 'taskkill.exe'),
          ['/PID', String(run.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      } catch (error) {
        if (run.child.exitCode === null && run.child.signalCode === null) throw error
      }
    }
    runs.delete(run)
    await pause(300)
  }

  let settingsStore
  function storeFor(appDirectory) {
    const data = path.join(appDirectory, 'data')
    return settingsStore({ fs: fsp, settingsPath: path.join(data, 'settings', 'application.json'), resourceRoot: data })
  }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')

  async function prepareSettings(appDirectory, label, coinCount) {
    const branding = path.join(appDirectory, 'data', 'branding')
    fs.mkdirSync(branding, { recursive: true })
    const patch = { navigationTitle: label, coinCount,
      memberPlatformHost: `127.0.0.${coinCount}`, memberPlatformPort: 8090 + coinCount }
    for (const [field, name] of Object.entries(resourceNames)) {
      const target = path.join(branding, name)
      fs.writeFileSync(target, Buffer.concat([png, Buffer.from(`${label}:${field}`)]))
      patch[field] = target
    }
    await storeFor(appDirectory).update(patch)
  }

  async function checkSettings(appDirectory, label, coinCount, resourceLabel = label) {
    const actual = await storeFor(appDirectory).get()
    assert.equal(actual.navigationTitle, label)
    assert.equal(actual.coinCount, coinCount)
    const json = JSON.parse(fs.readFileSync(path.join(appDirectory, 'data', 'settings', 'application.json'), 'utf8'))
    for (const [field, name] of Object.entries(resourceNames)) {
      assert.equal(json[field], `branding/${name}`)
      assert.equal(actual[field], path.join(appDirectory, 'data', 'branding', name))
      assert.ok(fs.readFileSync(actual[field]).equals(Buffer.concat([png, Buffer.from(`${resourceLabel}:${field}`)])))
    }
  }

  let java, h2Jar
  async function sql(appDirectory, statement) {
    const base = path.join(appDirectory, 'data', 'database', 'runtime', 'ledgame')
    let last
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const output = execFileSync(java, ['-cp', h2Jar, 'org.h2.tools.Shell',
          '-url', `jdbc:h2:file:${base};MODE=MySQL;DATABASE_TO_LOWER=TRUE;IFEXISTS=TRUE`,
          '-user', 'sa', '-password', '', '-sql', statement],
        { cwd, env: system, windowsHide: true, encoding: 'utf8', timeout: 10000 })
        if (/Error:|Exception/.test(output)) throw new Error(output)
        fs.appendFileSync(path.join(work, 'database-queries.log'), `${appDirectory}\n${statement}\n${output}\n`)
        return output
      } catch (error) {
        last = error
        const detail = `${error.message || error}\n${error.stdout || ''}\n${error.stderr || ''}`
        if (!/already in use|file is locked|file lock|90020|90098/i.test(detail)) throw error
        // The process tree has stopped; allow the OS time to release H2 handles.
        await pause(250)
      }
    }
    throw last
  }

  async function setMarker(appDirectory, marker) {
    await sql(appDirectory, 'SELECT COUNT(*) FROM game; SELECT COUNT(*) FROM spirit;')
    await sql(appDirectory, `CREATE TABLE IF NOT EXISTS portable_smoke_marker (marker VARCHAR(64) NOT NULL); DELETE FROM portable_smoke_marker; INSERT INTO portable_smoke_marker VALUES ('${marker}');`)
  }
  async function checkMarker(appDirectory, expected) {
    assert.match(await sql(appDirectory, 'SELECT marker FROM portable_smoke_marker;'), new RegExp(`\\b${expected}\\b`))
  }

  try {
    copyPackage(directory, packageA)
    copyPackage(directory, packageB)
    assert.equal(fs.existsSync(path.join(packageA, 'data')), false)
    assert.equal(fs.existsSync(path.join(packageB, 'data')), false)
    // Execute only these verified, packaged persistence modules in a separate
    // inspection folder; the production ASAR and executable remain untouched.
    const archive = path.join(packageA, 'resources', 'app.asar')
    const main = asar.extractFile(archive, path.join('electron', 'main.cjs')).toString('utf8')
    assert.match(main, /resourceRoot:\s*app\.getPath\('userData'\)/,
      'The released main process must wire settings resource resolution to its own userData')
    assert.ok(main.indexOf('configureDataDirectory({') < main.indexOf('app.requestSingleInstanceLock()'),
      'The released main process must select its data root before acquiring the instance lock')
    const inspected = path.join(work, 'packaged-settings-modules')
    fs.mkdirSync(inspected)
    for (const name of ['application-settings.cjs', 'application-resource-paths.cjs']) {
      fs.writeFileSync(path.join(inspected, name), asar.extractFile(archive, path.join('electron', name)))
    }
    settingsStore = require(path.join(inspected, 'application-settings.cjs')).createApplicationSettingsStore
    const zip = await unzipper.Open.file(path.join(packageA, 'resources', 'backend', 'ledGame-backend.jar'))
    const driver = zip.files.filter(entry => /^BOOT-INF\/lib\/h2-[^/]+\.jar$/.test(entry.path))
    assert.equal(driver.length, 1, 'The packaged backend must contain exactly one H2 driver')
    h2Jar = path.join(work, 'packaged-h2-driver.jar')
    fs.writeFileSync(h2Jar, await driver[0].buffer())
    java = path.join(packageA, 'resources', 'jre', 'bin', 'java.exe')
    await prepareSettings(packageA, 'Package A', 3)
    await prepareSettings(packageB, 'Package B', 7)
    const originalASettings = fs.readFileSync(path.join(packageA, 'data', 'settings', 'application.json'))

    const a = await ready(launch(packageA))
    const b = await ready(launch(packageB))
    assert.notEqual(a.port, b.port)
    assert.equal(a.child.exitCode, null)
    await checkSettings(packageA, 'Package A', 3)
    await checkSettings(packageB, 'Package B', 7)
    const duplicate = launch(packageA)
    const duplicateDeadline = Date.now() + 15000
    while (duplicate.child.exitCode === null && duplicate.child.signalCode === null && Date.now() < duplicateDeadline) {
      if (duplicate.error) throw duplicate.error
      await pause(100)
    }
    assert.ok(duplicate.child.exitCode !== null || duplicate.child.signalCode !== null, 'A second instance of the same package must exit')
    assert.doesNotMatch(duplicate.log(), /Embedded backend selected port/)
    await stop(duplicate)
    summary.checks.push('Two unchanged release executables run concurrently from another cwd, use separate data/H2/session roots and ports, and keep same-package single-instance behavior')
    summary.checks.push('Both isolated releases retain the real machine activation gate without copying or bypassing a license')
    await stop(a)
    await stop(b)

    await setMarker(packageA, 'package_a_only')
    await setMarker(packageB, 'package_b_only')
    const restartedA = await ready(launch(packageA))
    const restartedB = await ready(launch(packageB))
    assert.notEqual(restartedA.port, restartedB.port)
    await checkSettings(packageA, 'Package A', 3)
    await checkSettings(packageB, 'Package B', 7)
    await stop(restartedA)
    await stop(restartedB)
    await checkMarker(packageA, 'package_a_only')
    await checkMarker(packageB, 'package_b_only')
    await setMarker(packageB, 'package_b_changed')
    await checkMarker(packageA, 'package_a_only')
    summary.checks.push('Real H2 business schemas and independent SQL markers survive separate backend restarts; changing B leaves A unchanged')

    copyPackage(packageA, packageC, true)
    await checkSettings(packageC, 'Package A', 3)
    await storeFor(packageC).update({ navigationTitle: 'Package C', coinCount: 9 })
    const c = await ready(launch(packageC))
    await checkSettings(packageC, 'Package C', 9, 'Package A')
    await checkSettings(packageA, 'Package A', 3)
    assert.ok(fs.readFileSync(path.join(packageA, 'data', 'settings', 'application.json')).equals(originalASettings))
    await stop(c)
    await checkMarker(packageC, 'package_a_only')
    await setMarker(packageC, 'package_c_changed')
    await checkMarker(packageA, 'package_a_only')
    const restartedC = await ready(launch(packageC))
    await checkSettings(packageC, 'Package C', 9, 'Package A')
    await stop(restartedC)
    await checkMarker(packageC, 'package_c_changed')
    summary.checks.push('A stopped package copied with its data to C reads C resources and H2, keeps copied settings across restart, and subsequent C writes leave original A unchanged')
    summary.passed = true
    console.log(JSON.stringify(summary, null, 2))
    return summary
  } catch (error) {
    summary.failure = error.stack || String(error)
    throw error
  } finally {
    for (const run of [...runs]) {
      try { await stop(run) } catch (error) { summary.cleanupFailure = error.stack || String(error) }
    }
    fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify(summary, null, 2))
    console.log(`Portable data smoke logs: ${work}`)
  }
}

if (require.main === module) {
  smokePortableData(process.argv[2] || path.join(root, 'release', 'win-unpacked'))
    .catch(error => { console.error(error); process.exitCode = 1 })
}

module.exports = { smokePortableData }
