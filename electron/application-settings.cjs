const path = require('node:path')

const ENTRY_METHODS = Object.freeze(['touch', 'coin', 'wristband'])
const APPLICATION_MODES = Object.freeze(['debug', 'game'])
const TOUCH_IDLE_PROMPT_DEFAULTS = Object.freeze({
  'zh-CN': '开始游戏',
  'en-US': 'Start Game',
  'es-ES': 'Iniciar juego',
  'pt-PT': 'Iniciar jogo',
  'fr-FR': 'Démarrer le jeu',
  'de-DE': 'Spiel starten',
  'pl-PL': 'Rozpocznij grę',
  'ru-RU': 'Начать игру',
  'vi-VN': 'Bắt đầu trò chơi',
  'it-IT': 'Avvia gioco',
  'cs-CZ': 'Spustit hru',
  'ko-KR': '게임 시작',
  'ro-RO': 'Pornește jocul',
  'ar-SA': 'ابدأ اللعبة',
})
const TOUCH_IDLE_PROMPT_MAX_LENGTH = 48
const TOUCH_IDLE_PROMPT_FONT_SIZE_DEFAULT = 72
const TOUCH_IDLE_PROMPT_FONT_SIZE_MIN = 32
const TOUCH_IDLE_PROMPT_FONT_SIZE_MAX = 200
const APPLICATION_TITLE_DEFAULT = 'LED Game'
const TOUCH_EXIT_PASSWORD_DEFAULT = '888888'
const SECONDARY_DISPLAY_BACKGROUND_DEFAULT = null
const DEFAULT_APPLICATION_SETTINGS = Object.freeze({
  entryMethod: 'touch',
  mode: 'debug',
  memberPlatformHost: '127.0.0.1',
  memberPlatformPort: 8090,
  secondaryDisplay: null,
  touchIdlePromptTexts: TOUCH_IDLE_PROMPT_DEFAULTS,
  touchIdlePromptFontSize: TOUCH_IDLE_PROMPT_FONT_SIZE_DEFAULT,
  applicationTitle: APPLICATION_TITLE_DEFAULT,
  applicationIconPath: null,
  secondaryDisplayBackgroundPath: SECONDARY_DISPLAY_BACKGROUND_DEFAULT,
  touchExitPassword: TOUCH_EXIT_PASSWORD_DEFAULT,
})

function normalizeApplicationTitle(value) {
  const title = typeof value === 'string' ? value.trim() : ''
  return title && Array.from(title).length <= 64 ? title : APPLICATION_TITLE_DEFAULT
}

function normalizeTouchExitPassword(value) {
  return typeof value === 'string' && /^\d{4,12}$/.test(value)
    ? value : TOUCH_EXIT_PASSWORD_DEFAULT
}

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

function normalizeMemberPlatformHost(value) {
  const host = typeof value === 'string' ? value.trim() : ''
  return host && !host.includes('/') && !host.includes(':') ? host : DEFAULT_APPLICATION_SETTINGS.memberPlatformHost
}

function normalizeMemberPlatformPort(value) {
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65535
    ? port
    : DEFAULT_APPLICATION_SETTINGS.memberPlatformPort
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
    memberPlatformHost: normalizeMemberPlatformHost(source.memberPlatformHost),
    memberPlatformPort: normalizeMemberPlatformPort(source.memberPlatformPort),
    secondaryDisplay: normalizeSecondaryDisplay(source.secondaryDisplay),
    touchIdlePromptTexts: normalizeTouchIdlePromptTexts(
      source.touchIdlePromptTexts ?? source.touchIdlePromptText,
    ),
    touchIdlePromptFontSize: normalizeTouchIdlePromptFontSize(source.touchIdlePromptFontSize),
    applicationTitle: normalizeApplicationTitle(source.applicationTitle),
    applicationIconPath: typeof source.applicationIconPath === 'string' && source.applicationIconPath.trim()
      ? path.resolve(source.applicationIconPath) : null,
    secondaryDisplayBackgroundPath: typeof source.secondaryDisplayBackgroundPath === 'string'
      && source.secondaryDisplayBackgroundPath.trim()
      ? path.resolve(source.secondaryDisplayBackgroundPath) : SECONDARY_DISPLAY_BACKGROUND_DEFAULT,
    touchExitPassword: normalizeTouchExitPassword(source.touchExitPassword),
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
  if ('applicationTitle' in patch && (typeof patch.applicationTitle !== 'string'
    || !patch.applicationTitle.trim() || Array.from(patch.applicationTitle.trim()).length > 64)) {
    throw new Error('Application title must contain 1 to 64 characters')
  }
  if ('touchExitPassword' in patch && (typeof patch.touchExitPassword !== 'string'
    || !/^\d{4,12}$/.test(patch.touchExitPassword))) {
    throw new Error('Touch exit password must contain 4 to 12 digits')
  }
  if ('secondaryDisplayBackgroundPath' in patch && patch.secondaryDisplayBackgroundPath !== null
    && (typeof patch.secondaryDisplayBackgroundPath !== 'string' || !patch.secondaryDisplayBackgroundPath.trim())) {
    throw new Error('Secondary display background path must be a file path or null')
  }
  if ('memberPlatformHost' in patch && (typeof patch.memberPlatformHost !== 'string'
    || normalizeMemberPlatformHost(patch.memberPlatformHost) !== patch.memberPlatformHost.trim())) {
    throw new Error('Member platform host is invalid')
  }
  if ('memberPlatformPort' in patch && normalizeMemberPlatformPort(patch.memberPlatformPort) !== Number(patch.memberPlatformPort)) {
    throw new Error('Member platform port must be between 1 and 65535')
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
  APPLICATION_TITLE_DEFAULT,
  DEFAULT_APPLICATION_SETTINGS,
  ENTRY_METHODS,
  TOUCH_IDLE_PROMPT_DEFAULTS,
  TOUCH_IDLE_PROMPT_FONT_SIZE_DEFAULT,
  TOUCH_IDLE_PROMPT_FONT_SIZE_MAX,
  TOUCH_IDLE_PROMPT_FONT_SIZE_MIN,
  TOUCH_IDLE_PROMPT_MAX_LENGTH,
  TOUCH_EXIT_PASSWORD_DEFAULT,
  SECONDARY_DISPLAY_BACKGROUND_DEFAULT,
  createApplicationSettingsStore,
  normalizeApplicationSettings,
  normalizeSecondaryDisplay,
}
