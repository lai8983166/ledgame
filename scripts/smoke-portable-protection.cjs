const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
const { createRequire } = require('node:module')
const { windowsSystemEnvironment } = require('../electron/backend-protection.cjs')
const { verifyPortableProtection } = require('./verify-portable-protection.cjs')

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const root = path.resolve(__dirname, '..')

async function smokePortableProtection(directory) {
  assert.equal(process.platform, 'win32', 'This smoke test runs the Windows executable')
  await verifyPortableProtection(directory)
  const buildDirectory = path.join(root, '.build')
  fs.mkdirSync(buildDirectory, { recursive: true })
  const work = fs.mkdtempSync(path.join(buildDirectory, 'protection-smoke-'))
  const appDirectory = path.join(work, 'app')
  const system = windowsSystemEnvironment(process.report.getReport())
  const executable = path.join(appDirectory, 'LED Game.exe')
  const jar = path.join(appDirectory, 'resources', 'backend', 'ledGame-backend.jar')
  const archive = path.join(appDirectory, 'resources', 'app.asar')
  const summary = { package: path.resolve(directory), checks: [] }
  let current

  function stop() {
    if (!current) return
    const child = current
    current = undefined
    try {
      execFileSync(path.join(system.SYSTEMROOT, 'System32', 'taskkill.exe'),
        ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) throw error
    }
  }

  function launch(name, extra = {}) {
    const userData = path.join(work, name)
    const output = fs.openSync(path.join(work, `${name}.console.log`), 'w')
    const env = { ...process.env, ...system, LED_USER_DATA_DIR: userData,
      ELC408_ENABLED: 'false', LED_ROOM_CONNECTION_ENABLED: 'false', ...extra }
    current = spawn(executable, [], { cwd: appDirectory, env, windowsHide: true,
      stdio: ['ignore', output, output] })
    fs.closeSync(output)
    const processForRun = current
    let spawnError
    current.once('error', error => { spawnError = error })
    return {
      userData,
      log() {
        const file = path.join(userData, 'logs', 'startup.log')
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
      },
      async until(predicate, timeout = 45000) {
        const deadline = Date.now() + timeout
        while (Date.now() < deadline) {
          if (spawnError) throw spawnError
          if (await predicate()) return
          if (/Backend startup failed|Embedded backend exited/.test(this.log())) {
            throw new Error(`${name} backend startup failed; see ${work}`)
          }
          if (processForRun.exitCode !== null || processForRun.signalCode !== null) {
            throw new Error(`${name} exited before the expected condition; see ${work}`)
          }
          await pause(200)
        }
        throw new Error(`${name} timed out; see ${work}`)
      },
      async refusedBeforeStartup() {
        const deadline = Date.now() + 15000
        while (Date.now() < deadline && processForRun.exitCode === null && processForRun.signalCode === null) {
          if (spawnError) throw spawnError
          assert.doesNotMatch(this.log(), /Embedded backend is ready/)
          await pause(200)
        }
        assert.ok(processForRun.exitCode !== null || processForRun.signalCode !== null,
          `Tampered executable did not exit; see ${work}`)
        assert.doesNotMatch(this.log(), /Starting embedded backend|Embedded backend is ready/)
      },
    }
  }

  try {
    // Use a disposable copy. Do not alter the release package, live database,
    // license or hardware configuration. Media and seed data are not needed.
    fs.cpSync(directory, appDirectory, { recursive: true, filter: source => {
      const relative = path.relative(directory, source).split(path.sep)
      return !(relative[0] === 'resources' && ['media', 'seed-database'].includes(relative[1])) &&
        relative[0] !== 'elc408'
    } })
    fs.writeFileSync(path.join(appDirectory, 'application.properties'),
      'server.address=0.0.0.0\nspring.datasource.url=jdbc:h2:mem:untrusted\nspring.h2.console.enabled=true\n')
    fs.mkdirSync(path.join(appDirectory, 'config'), { recursive: true })
    fs.writeFileSync(path.join(appDirectory, 'config', 'application.properties'),
      'spring.main.web-application-type=none\n')
    const normal = launch('injected-environment', {
      ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--require=missing-injected-module',
      JAVA_TOOL_OPTIONS: '-javaagent:missing-injected-agent.jar',
      JDK_JAVA_OPTIONS: '-javaagent:missing-injected-agent.jar', _JAVA_OPTIONS: '-agentlib:missing',
      SPRING_APPLICATION_JSON: '{"spring":{"main":{"web-application-type":"none"}}}',
      SPRING_CONFIG_LOCATION: 'file:missing-config.yml', SPRING_PROFILES_ACTIVE: 'acceptance',
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:1', LED_BACKEND_URL: 'http://127.0.0.1:1',
      LED_RUNTIME_STATE_URL: 'ws://127.0.0.1:1',
      PATH: path.join(work, 'untrusted-bin'),
    })
    await normal.until(() => normal.log().includes('Embedded backend is ready'))
    const port = Number(normal.log().match(/Embedded backend selected port (\d+)/)?.[1])
    assert.ok(port > 0)
    const base = `http://127.0.0.1:${port}`
    const activation = await (await fetch(`${base}/activation`)).json()
    assert.equal(activation.data.activated, false)
    assert.match(activation.data.machineCode, /^LGG1-[A-F0-9]{64}$/)
    assert.equal((await fetch(`${base}/game-categories`)).status, 403)
    const connections = execFileSync(path.join(system.SYSTEMROOT, 'System32', 'netstat.exe'),
      ['-ano', '-p', 'tcp'], { windowsHide: true, encoding: 'utf8' })
    const listeners = connections.split(/\r?\n/).map(line =>
      line.match(/^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+\d+/i)?.[1])
      .filter(address => address?.endsWith(`:${port}`))
    assert.deepEqual(listeners, [`127.0.0.1:${port}`])
    const backendLog = fs.readFileSync(path.join(normal.userData, 'logs', 'backend.log'), 'utf8')
    assert.doesNotMatch(backendLog, /Picked up (?:JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS)|Error opening zip file/)
    summary.checks.push('Normal startup, machine identity, activation gate, loopback binding and injection rejection')
    stop()
    await pause(500)

    const jarSize = fs.statSync(jar).size
    fs.appendFileSync(jar, 'tampered')
    const tamperedJar = launch('tampered-jar')
    await tamperedJar.until(() => tamperedJar.log().includes('Backend integrity verification failed'))
    assert.doesNotMatch(tamperedJar.log(), /Embedded backend selected port|Embedded backend is ready/)
    assert.equal(fs.existsSync(path.join(tamperedJar.userData, 'database')), false)
    assert.equal(fs.existsSync(path.join(tamperedJar.userData, 'logs', 'backend.log')), false)
    summary.checks.push('Modified backend JAR rejected before database preparation and Java startup')
    stop()
    await pause(500)
    fs.truncateSync(jar, jarSize)

    const builderRequire = createRequire(require.resolve('electron-builder'))
    const packagingRequire = createRequire(builderRequire.resolve('app-builder-lib'))
    const asar = packagingRequire('@electron/asar')
    const originalAsar = fs.readFileSync(archive)
    const helper = asar.extractFile(archive, 'electron/backend-protection.cjs')
    const offset = originalAsar.indexOf(helper)
    assert.ok(offset >= 0)
    const mutated = Buffer.from(originalAsar)
    mutated[offset] ^= 1
    fs.writeFileSync(archive, mutated)
    await launch('tampered-asar').refusedBeforeStartup()
    summary.checks.push('Modified ASAR rejected by the packaged executable')
    stop()
    fs.writeFileSync(archive, originalAsar)

    fs.renameSync(archive, `${archive}.saved`)
    fs.mkdirSync(path.join(appDirectory, 'resources', 'app'))
    fs.writeFileSync(path.join(appDirectory, 'resources', 'app', 'package.json'), '{"main":"index.js"}')
    const marker = path.join(work, 'unpacked-executed')
    fs.writeFileSync(path.join(appDirectory, 'resources', 'app', 'index.js'),
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'untrusted');require('electron').app.quit()`)
    await launch('unpacked-replacement').refusedBeforeStartup()
    assert.equal(fs.existsSync(marker), false)
    summary.checks.push('Unpacked resources/app replacement refused')
    stop()
    summary.passed = true
    console.log(JSON.stringify(summary, null, 2))
    return summary
  } finally {
    stop()
    fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify(summary, null, 2))
    // Retain the disposable package with the logs for inspection. No release
    // files or existing user data are removed by this acceptance command.
    console.log(`Protection smoke logs: ${work}`)
  }
}

if (require.main === module) {
  smokePortableProtection(path.resolve(process.argv[2] || path.join(root, 'release', 'win-unpacked')))
    .catch(error => { console.error(error); process.exitCode = 1 })
}

module.exports = { smokePortableProtection }
