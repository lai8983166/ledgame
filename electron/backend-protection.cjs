const path = require('node:path')
const { createReadStream } = require('node:fs')
const { createHash } = require('node:crypto')

function resolveLaunchOptions(isPackaged, env = process.env) {
  return {
    devServerUrl: isPackaged ? undefined : env.VITE_DEV_SERVER_URL,
    backendUrl: isPackaged ? undefined : env.LED_BACKEND_URL,
    runtimeStateUrl: isPackaged ? undefined : env.LED_RUNTIME_STATE_URL,
  }
}

// Read the directory of an already loaded Windows system DLL, rather than
// trusting a caller-supplied SystemRoot or searching its PATH for reg.exe.
function windowsSystemEnvironment(report) {
  const kernel = report.sharedObjects?.find(file =>
    path.win32.isAbsolute(file) &&
    path.win32.basename(file).toLowerCase() === 'kernel32.dll' &&
    path.win32.basename(path.win32.dirname(file)).toLowerCase() === 'system32')
  if (!kernel) throw new Error('无法定位 Windows 系统目录，请检查运行环境后重新打开应用。')
  const systemDirectory = path.win32.dirname(kernel)
  const systemRoot = path.win32.dirname(systemDirectory)
  return {
    SYSTEMROOT: systemRoot,
    WINDIR: systemRoot,
    PATH: [systemDirectory, systemRoot, path.win32.join(systemDirectory, 'Wbem')].join(';'),
  }
}

const systemVariables = ['TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']
const applicationVariables = [
  'ELC408_ENABLED', 'LED_BRIDGE_ENABLED', 'LED_ROOM_CONNECTION_ENABLED',
  'LED_ROOM_RECONNECT_DELAY', 'LEDGAME_DEVICE_ID', 'LEDGAME_ROOM_ID', 'LEDGAME_ROOM_NAME',
  'SETTLEMENT_POLL_INTERVAL', 'SETTLEMENT_RETRY_INITIAL_DELAY', 'SETTLEMENT_RETRY_MAX_DELAY',
]

function createBackendEnvironment({ env = process.env, values, platform = process.platform,
  report = () => process.report.getReport() }) {
  // Windows treats environment names case-insensitively. Emit one canonical
  // spelling so mixed-case aliases cannot bypass the allowlist or overrides.
  const inherited = new Map(Object.entries(env).map(([key, value]) => [key.toUpperCase(), value]))
  const result = {}
  for (const name of [...systemVariables, ...applicationVariables]) {
    if (inherited.has(name)) result[name] = inherited.get(name)
  }
  if (platform === 'win32') Object.assign(result, windowsSystemEnvironment(report()))
  else result.PATH = '/usr/bin:/bin'
  return Object.assign(result, values)
}

function backendArguments(jarPath) {
  return [
    '-jar', jarPath,
    // Replace Spring's external working-directory/config search locations.
    '--spring.config.location=classpath:/,optional:classpath:/config/',
    '--spring.profiles.active=default',
    '--server.address=127.0.0.1',
    '--spring.h2.console.enabled=false',
    '--spring.web.resources.add-mappings=false',
    '--springdoc.api-docs.enabled=false',
    '--springdoc.swagger-ui.enabled=false',
    '--knife4j.enable=false',
  ]
}

async function verifyBackendIntegrity(jarPath, loadManifest) {
  try {
    const manifest = loadManifest()
    if (!/^[a-f0-9]{64}$/.test(manifest?.jarSha256)) throw new Error('Invalid backend integrity manifest')
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(jarPath)) hash.update(chunk)
    if (hash.digest('hex') !== manifest.jarSha256) throw new Error('Backend JAR SHA-256 mismatch')
  } catch (cause) {
    const error = new Error('游戏服务文件损坏，请重新安装完整程序。', { cause })
    error.code = 'BACKEND_INTEGRITY_FAILED'
    throw error
  }
}

module.exports = {
  resolveLaunchOptions, windowsSystemEnvironment, createBackendEnvironment,
  backendArguments, verifyBackendIntegrity,
}
