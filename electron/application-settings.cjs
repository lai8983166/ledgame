const path = require('node:path')

const ENTRY_METHODS = Object.freeze(['touch', 'coin', 'wristband'])
const APPLICATION_MODES = Object.freeze(['debug', 'game'])
const TOUCH_IDLE_PROMPT_DEFAULTS = Object.freeze({
  'zh-CN': '开始游戏',
  'en-US': 'Start Game',
  'ru-RU': 'Начать игру',
  'ko-KR': '게임 시작',
  'ja-JP': 'ゲームを開始',
})
const TOUCH_IDLE_PROMPT_MAX_LENGTH = 48
const TOUCH_IDLE_PROMPT_FONT_SIZE_DEFAULT = 72
const TOUCH_IDLE_PROMPT_FONT_SIZE_MIN = 32
const TOUCH_IDLE_PROMPT_FONT_SIZE_MAX = 200
const DEFAULT_APPLICATION_SETTINGS = Object.freeze({
  entryMethod: 'touch',
  mode: 'debug',
  secondaryDisplay: null,
  touchIdlePromptTexts: TOUCH_IDLE_PROMPT_DEFAULTS,
  touchIdlePromptFontSize: TOUCH_IDLE_PROMPT_FONT_SIZE_DEFAULT,
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

function normalizeTouchIdlePromptTexts(value) {
  const source = value && typeof value === 'object'
    ? value
    : typeof value === 'string'
      ? { 'zh-CN': value }
      : {}
  return Object.fromEntries(Object.entries(TOUCH_IDLE_PROMPT_DEFAULTS).map(([locale, fallback]) => {
    const text = typeof source[locale] === 'string' ? source[locale].trim() : ''
    return [locale, text && Array.from(text).length <= TOUCH_IDLE_PROMPT_MAX_LENGTH ? text : fallback]
  }))
}

function normalizeTouchIdlePromptFontSize(value) {
  return Number.isInteger(value)
    && value >= TOUCH_IDLE_PROMPT_FONT_SIZE_MIN
    && value <= TOUCH_IDLE_PROMPT_FONT_SIZE_MAX
    ? value
    : TOUCH_IDLE_PROMPT_FONT_SIZE_DEFAULT
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
    touchIdlePromptTexts: normalizeTouchIdlePromptTexts(
      source.touchIdlePromptTexts ?? source.touchIdlePromptText,
    ),
    touchIdlePromptFontSize: normalizeTouchIdlePromptFontSize(source.touchIdlePromptFontSize),
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
  if ('touchIdlePromptTexts' in patch || 'touchIdlePromptText' in patch) {
    const value = patch.touchIdlePromptTexts ?? patch.touchIdlePromptText
    if (!value || typeof value !== 'object' && typeof value !== 'string') {
      throw new Error('Touch idle prompt texts must be a locale map or string')
    }
    const entries = typeof value === 'string' ? [['zh-CN', value]] : Object.entries(value)
    for (const [locale, rawText] of entries) {
      if (!(locale in TOUCH_IDLE_PROMPT_DEFAULTS)) continue
      if (typeof rawText !== 'string' || !rawText.trim()) {
        throw new Error(`Touch idle prompt text for ${locale} must not be blank`)
      }
      if (Array.from(rawText.trim()).length > TOUCH_IDLE_PROMPT_MAX_LENGTH) {
        throw new Error(`Touch idle prompt text for ${locale} must be at most ${TOUCH_IDLE_PROMPT_MAX_LENGTH} characters`)
      }
    }
  }
  if (
    'touchIdlePromptFontSize' in patch &&
    (!Number.isInteger(patch.touchIdlePromptFontSize)
      || patch.touchIdlePromptFontSize < TOUCH_IDLE_PROMPT_FONT_SIZE_MIN
      || patch.touchIdlePromptFontSize > TOUCH_IDLE_PROMPT_FONT_SIZE_MAX)
  ) {
    throw new Error(
      `Touch idle prompt font size must be an integer between ${TOUCH_IDLE_PROMPT_FONT_SIZE_MIN} and ${TOUCH_IDLE_PROMPT_FONT_SIZE_MAX}`,
    )
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
  TOUCH_IDLE_PROMPT_DEFAULTS,
  TOUCH_IDLE_PROMPT_FONT_SIZE_DEFAULT,
  TOUCH_IDLE_PROMPT_FONT_SIZE_MAX,
  TOUCH_IDLE_PROMPT_FONT_SIZE_MIN,
  TOUCH_IDLE_PROMPT_MAX_LENGTH,
  createApplicationSettingsStore,
  normalizeApplicationSettings,
  normalizeSecondaryDisplay,
}
