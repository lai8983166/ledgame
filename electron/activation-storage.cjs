const path = require('node:path')

function resolveActivationStorage({ app, env = process.env }) {
  const userData = path.resolve(app.getPath('userData'))
  // Explicit profile isolation must also isolate authorization. Regression
  // launches must never read or replace the current user's real license.
  if (typeof env.LED_USER_DATA_DIR === 'string' && env.LED_USER_DATA_DIR.trim()) {
    return { directory: path.join(userData, 'activation'), legacyDirectories: [] }
  }

  // Use a fixed product directory, independent of the package location, its
  // portable data directory and app.setName(). The backend still verifies the
  // signature and this machine's identity on every new process.
  const directory = path.resolve(app.getPath('appData'), 'led-game', 'activation')
  const candidates = [
    path.join(userData, 'activation'),
    path.resolve(app.getPath('home'), '.ledgame-game', 'activation'),
  ]
  const key = value => process.platform === 'win32' ? value.toLowerCase() : value
  const seen = new Set([key(directory)])
  const legacyDirectories = candidates.filter(candidate => {
    const value = key(candidate)
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
  return { directory, legacyDirectories }
}

module.exports = { resolveActivationStorage }
