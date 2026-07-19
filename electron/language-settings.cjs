const path = require('node:path')

const DEFAULT_LOCALE = 'zh-CN'
const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en-US', 'ru-RU', 'ko-KR', 'ja-JP'])

function normalizeLocale(value) {
  return SUPPORTED_LOCALES.includes(value) ? value : DEFAULT_LOCALE
}

function createLanguagePreferenceStore({ fs, settingsPath }) {
  if (!fs || !settingsPath) {
    throw new Error('Language preference store requires fs and settingsPath')
  }
  let currentLocale = null
  let writeQueue = Promise.resolve()

  async function get() {
    if (currentLocale) {
      return currentLocale
    }
    try {
      const content = await fs.readFile(settingsPath, 'utf8')
      currentLocale = normalizeLocale(JSON.parse(content)?.locale)
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') {
        throw error
      }
      currentLocale = DEFAULT_LOCALE
    }
    return currentLocale
  }

  async function set(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) {
      throw new Error(`Unsupported application locale: ${locale}`)
    }
    writeQueue = writeQueue.then(async () => {
      const directory = path.dirname(settingsPath)
      const temporaryPath = `${settingsPath}.tmp`
      await fs.mkdir(directory, { recursive: true })
      await fs.writeFile(temporaryPath, `${JSON.stringify({ locale }, null, 2)}\n`, 'utf8')
      await fs.rename(temporaryPath, settingsPath)
      currentLocale = locale
      return currentLocale
    })
    return writeQueue
  }

  return { get, set }
}

module.exports = {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  createLanguagePreferenceStore,
  normalizeLocale,
}
