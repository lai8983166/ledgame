const path = require('node:path')
const { randomUUID } = require('node:crypto')

function resolveDataDirectory({ isPackaged, executablePath, defaultUserDataPath, override }) {
  if (typeof override === 'string' && override.trim()) return path.resolve(override)
  return isPackaged
    ? path.join(path.dirname(executablePath), 'data')
    : defaultUserDataPath
}

function configureDataDirectory({ app, fs, env = process.env }) {
  const overridden = typeof env.LED_USER_DATA_DIR === 'string' && Boolean(env.LED_USER_DATA_DIR.trim())
  const directory = resolveDataDirectory({
    isPackaged: app.isPackaged,
    executablePath: app.getPath('exe'),
    defaultUserDataPath: app.getPath('userData'),
    override: env.LED_USER_DATA_DIR,
  })
  // Development retains Electron's existing profile unless an isolated profile
  // was explicitly requested. Packaged launches never use a roaming fallback.
  if (!app.isPackaged && !overridden) return directory

  const sessionDirectory = path.join(directory, 'session')
  const probe = path.join(directory, `.write-check-${randomUUID()}`)
  let probeCreated = false
  try {
    fs.mkdirSync(directory, { recursive: true })
    fs.mkdirSync(sessionDirectory, { recursive: true })
    fs.writeFileSync(probe, '', { flag: 'wx' })
    probeCreated = true
    fs.unlinkSync(probe)
    probeCreated = false
    app.setPath('userData', directory)
    app.setPath('sessionData', sessionDirectory)
  } catch (cause) {
    const error = new Error(
      `无法写入游戏数据目录：${directory}\n请将完整游戏包解压到可写目录后重新启动。\n${cause.message || String(cause)}`,
      { cause },
    )
    error.code = 'DATA_DIRECTORY_UNAVAILABLE'
    throw error
  } finally {
    if (probeCreated) {
      try { fs.unlinkSync(probe) } catch (_) { /* Keep the original failure. */ }
    }
  }
  return directory
}

module.exports = { configureDataDirectory, resolveDataDirectory }
