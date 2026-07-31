const path = require('node:path')

const ENTRY_METHODS = Object.freeze(['touch', 'coin', 'wristband'])
const APPLICATION_MODES = Object.freeze(['debug', 'game'])
const DEFAULT_APPLICATION_SETTINGS = Object.freeze({
  entryMethod: 'touch',
  mode: 'debug',
  secondaryDisplay: null,
})

function normalizeBounds(value) {
  if (!value || typeof value !== 'object') {
    return null
  }
  const bounds = {
    x: Number(value.x),
    y: Number(value.y),
    width: Number(value.width),
    height: Number(value.height),
  }
  return Object.values(bounds).every(Number.isFinite) && bounds.width > 0 && bounds.height > 0
    ? bounds
    : null
}

function normalizeSecondaryDisplay(value) {
  if (!value || typeof value !== 'object') {
    return null
  }
  const id = String(value.id ?? '').trim()
  const label = String(value.label ?? '').trim()
  const bounds = normalizeBounds(value.bounds)
  if (!id || !bounds) {
    return null
  }
  return {
    id,
    label,
    bounds,
  }
}

function normalizeApplicationSettings(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    entryMethod: ENTRY_METHODS.includes(source.entryMethod)
      ? source.entryMethod
      : DEFAULT_APPLICATION_SETTINGS.entryMethod,
    mode: APPLICATION_MODES.includes(source.mode)
      ? source.mode
      : DEFAULT_APPLICATION_SETTINGS.mode,
    secondaryDisplay: normalizeSecondaryDisplay(source.secondaryDisplay),
  }
}

function validateSettingsPatch(value) {
  const patch = value && typeof value === 'object' ? value : {}
  if ('entryMethod' in patch && !ENTRY_METHODS.includes(patch.entryMethod)) {
    throw new Error(`Unsupported entry method: ${patch.entryMethod}`)
  }
  if ('mode' in patch && !APPLICATION_MODES.includes(patch.mode)) {
    throw new Error(`Unsupported application mode: ${patch.mode}`)
  }
  if (
    'secondaryDisplay' in patch &&
    patch.secondaryDisplay !== null &&
    !normalizeSecondaryDisplay(patch.secondaryDisplay)
  ) {
    throw new Error('Invalid secondary display selection')
  }
  return patch
}

function createApplicationSettingsStore({ fs, settingsPath }) {
  if (!fs || !settingsPath) {
    throw new Error('Application settings store requires fs and settingsPath')
  }

  let cachedSettings = null
  let writeQueue = Promise.resolve()

  async function get() {
    if (cachedSettings) {
      return structuredClone(cachedSettings)
    }
    try {
      const content = await fs.readFile(settingsPath, 'utf8')
      cachedSettings = normalizeApplicationSettings(JSON.parse(content))
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') {
        throw error
      }
      cachedSettings = normalizeApplicationSettings(null)
    }
    return structuredClone(cachedSettings)
  }

  async function update(value) {
    const patch = validateSettingsPatch(value)
    writeQueue = writeQueue.then(async () => {
      const current = await get()
      const next = normalizeApplicationSettings({
        ...current,
        ...patch,
        secondaryDisplay:
          'secondaryDisplay' in patch ? patch.secondaryDisplay : current.secondaryDisplay,
      })
      const directory = path.dirname(settingsPath)
      const temporaryPath = `${settingsPath}.tmp`
      await fs.mkdir(directory, { recursive: true })
      await fs.writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      await fs.rename(temporaryPath, settingsPath)
      cachedSettings = next
      return structuredClone(next)
    })
    return writeQueue
  }

  return { get, update }
}

module.exports = {
  APPLICATION_MODES,
  DEFAULT_APPLICATION_SETTINGS,
  ENTRY_METHODS,
  createApplicationSettingsStore,
  normalizeApplicationSettings,
  normalizeSecondaryDisplay,
}
