import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const { resolveLaunchOptions, windowsSystemEnvironment, createBackendEnvironment,
  backendArguments, verifyBackendIntegrity } = require('../electron/backend-protection.cjs')
const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
const hash = value => createHash('sha256').update(value).digest('hex')

test('packaged launches ignore alternate backend, runtime and renderer while development keeps them', () => {
  const env = { VITE_DEV_SERVER_URL: 'http://untrusted', LED_BACKEND_URL: 'http://untrusted:2',
    LED_RUNTIME_STATE_URL: 'ws://untrusted:3' }
  assert.deepEqual(resolveLaunchOptions(true, env), {
    devServerUrl: undefined, backendUrl: undefined, runtimeStateUrl: undefined,
  })
  assert.deepEqual(resolveLaunchOptions(false, env), {
    devServerUrl: env.VITE_DEV_SERVER_URL, backendUrl: env.LED_BACKEND_URL,
    runtimeStateUrl: env.LED_RUNTIME_STATE_URL,
  })
})

test('Windows system paths come from the loaded system module, independent of inherited PATH/SystemRoot', () => {
  const report = { sharedObjects: ['C:\\app\\kernel32.dll', 'D:\\Windows\\System32\\KERNEL32.DLL'] }
  assert.deepEqual(windowsSystemEnvironment(report), {
    SYSTEMROOT: 'D:\\Windows', WINDIR: 'D:\\Windows',
    PATH: 'D:\\Windows\\System32;D:\\Windows;D:\\Windows\\System32\\Wbem',
  })
  assert.throws(() => windowsSystemEnvironment({ sharedObjects: ['kernel32.dll'] }), /系统目录/)
})

test('child environment drops injections and broad-prefix aliases, preserving only required values', () => {
  const env = {
    ...process.env, JAVA_TOOL_OPTIONS: '-javaagent:evil.jar', _JAVA_OPTIONS: '-agentlib:evil',
    JDK_JAVA_OPTIONS: '-javaagent:evil.jar', CLASSPATH: 'evil', SPRING_APPLICATION_JSON: '{}',
    NODE_OPTIONS: '--require evil', NODE_EXTRA_CA_CERTS: 'evil',
    spring_config_location: 'file:evil/', Spring_Profiles_Active: 'acceptance',
    LED_UNKNOWN: 'evil', ELC408_UNKNOWN: 'evil', LEDGAME_SOAK_INPUTENABLED: 'true',
    LED_BACKEND_URL: 'http://evil', Path: 'C:\\evil', SystemRoot: 'C:\\evil',
    ledgame_room_name: '测试房间', ELC408_ENABLED: 'false', SERVER_PORT: '1',
  }
  const childEnv = createBackendEnvironment({ env, values: { SERVER_PORT: '37680',
    SPRING_DATASOURCE_URL: 'jdbc:h2:mem:trusted' } })
  const result = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))'],
    { env: childEnv, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  const actual = JSON.parse(result.stdout)
  for (const name of ['JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'CLASSPATH',
    'SPRING_APPLICATION_JSON', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'SPRING_CONFIG_LOCATION',
    'SPRING_PROFILES_ACTIVE', 'LED_UNKNOWN', 'ELC408_UNKNOWN', 'LEDGAME_SOAK_INPUTENABLED', 'LED_BACKEND_URL']) {
    assert.equal(Object.keys(actual).some(key => key.toUpperCase() === name), false, name)
  }
  assert.equal(actual.LEDGAME_ROOM_NAME, '测试房间')
  assert.equal(actual.ELC408_ENABLED, 'false')
  assert.equal(actual.SERVER_PORT, '37680')
  assert.equal(actual.SPRING_DATASOURCE_URL, 'jdbc:h2:mem:trusted')
  if (process.platform === 'win32') {
    assert.notEqual(actual.SYSTEMROOT.toLowerCase(), 'c:\\evil')
    assert.equal(actual.PATH.includes('C:\\evil'), false)
  }
})

test('packaged backend verification accepts the release JAR and fails on tampering or missing trust data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ledgame-integrity-'))
  try {
    const jar = path.join(directory, 'backend.jar')
    const original = Buffer.from('release backend')
    await writeFile(jar, original)
    const manifest = () => ({ jarSha256: hash(original) })
    await verifyBackendIntegrity(jar, manifest)
    await writeFile(jar, 'modified backend')
    const rejected = error => error.code === 'BACKEND_INTEGRITY_FAILED' && /文件损坏/.test(error.message)
    await assert.rejects(verifyBackendIntegrity(jar, manifest), rejected)
    await assert.rejects(verifyBackendIntegrity(jar, () => ({})), rejected)
    await assert.rejects(verifyBackendIntegrity(jar, () => { throw new Error('missing module') }), rejected)
    await rm(jar)
    await assert.rejects(verifyBackendIntegrity(jar, manifest), rejected)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('startup refuses an invalid packaged JAR before database preparation or Java spawning', async () => {
  const start = main.indexOf('async function startEmbeddedBackend()')
  const source = main.slice(start, main.indexOf('\nfunction stopEmbeddedBackend()', start))
  const effects = []
  const context = {
    shouldUseEmbeddedBackend: true, embeddedBackendProcess: null, app: { isPackaged: true },
    getEmbeddedBackendJarPath: () => 'missing-backend.jar', getEmbeddedJavaPath: () => 'java.exe',
    appendStartupLog: value => effects.push(['log', value]), verifyBackendIntegrity,
    require: () => ({ jarSha256: '0'.repeat(64) }),
    nodeFs: { existsSync: () => true }, prepareUserDatabase: () => effects.push(['database']),
    childProcess: { spawn: () => effects.push(['spawn']) },
  }
  await assert.rejects(vm.runInNewContext(`${source}\nstartEmbeddedBackend()`, context),
    error => error.code === 'BACKEND_INTEGRITY_FAILED')
  assert.equal(effects.some(([type]) => type === 'spawn' || type === 'database'), false)
  assert.equal(effects.some(([, value]) => value.includes('integrity verification failed')), true)
})

test('backend command uses classpath configuration and fixes production security settings', () => {
  const args = backendArguments('C:\\app with spaces\\backend.jar')
  assert.deepEqual(args.slice(0, 2), ['-jar', 'C:\\app with spaces\\backend.jar'])
  assert.ok(args.includes('--spring.config.location=classpath:/,optional:classpath:/config/'))
  assert.ok(args.includes('--spring.profiles.active=default'))
  assert.ok(args.includes('--server.address=127.0.0.1'))
  for (const option of ['spring.h2.console.enabled', 'spring.web.resources.add-mappings', 'springdoc.api-docs.enabled',
    'springdoc.swagger-ui.enabled', 'knife4j.enable']) assert.ok(args.includes(`--${option}=false`))
})

test('fatal startup failure approves cleanup without waiting for renderer close confirmation', () => {
  const start = main.indexOf('function handleStartupFailure(error)')
  const source = main.slice(start, main.indexOf('\nasync function engineStateRequest', start))
  let quit = false
  const context = {
    console: { error() {} }, appendStartupLog() {}, splashLifecycle: { close() {} }, splashWindow: {},
    mainCloseApproved: false, dialog: { showErrorBox() {} }, app: { quit() { quit = true } },
  }
  vm.runInNewContext(`${source}\nhandleStartupFailure(new Error('文件损坏'))`, context)
  assert.equal(context.mainCloseApproved, true)
  assert.equal(quit, true)
})
