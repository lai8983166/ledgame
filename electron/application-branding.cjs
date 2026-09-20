const path = require('node:path')

const SUPPORTED_ICON_EXTENSIONS = new Set(['.ico', '.png'])
const MAX_ICON_BYTES = 5 * 1024 * 1024
const SUPPORTED_BACKGROUND_EXTENSIONS = new Set(['.apng', '.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp'])
const MAX_BACKGROUND_BYTES = 20 * 1024 * 1024
const SUPPORTED_IDLE_MEDIA_EXTENSIONS = new Set([
  ...SUPPORTED_BACKGROUND_EXTENSIONS,
  '.m4v', '.mov', '.mp4', '.ogg', '.ogv', '.webm',
])
const MAX_IDLE_MEDIA_BYTES = 200 * 1024 * 1024

function toPublicApplicationSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings
  const { touchExitPassword: _secret, ...publicSettings } = settings
  return publicSettings
}

function applyApplicationBrand({ app, BrowserWindow, fsSync, settings, splashWindow = null }) {
  const title = settings?.applicationTitle || 'LED Game'
  app.setName(title)
  const iconPath = settings?.applicationIconPath
  const iconAvailable = Boolean(iconPath && fsSync.existsSync(iconPath))
  BrowserWindow.getAllWindows().forEach((window) => {
    if (window.isDestroyed() || window === splashWindow) return
    window.setTitle(title)
    if (iconAvailable) window.setIcon(iconPath)
  })
  return { title, iconAvailable }
}

async function installApplicationIcon({ fs, nativeImage, source, userDataPath, now = Date.now }) {
  const extension = path.extname(source || '').toLowerCase()
  if (!SUPPORTED_ICON_EXTENSIONS.has(extension)) {
    throw new Error('应用图标仅支持 PNG 或 ICO 文件')
  }
  const stat = await fs.stat(source)
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_ICON_BYTES) {
    throw new Error('应用图标必须是 5MB 以内的有效文件')
  }
  const image = nativeImage.createFromPath(source)
  if (!image || image.isEmpty()) throw new Error('无法解析所选应用图标')

  const directory = path.join(userDataPath, 'branding')
  const target = path.join(directory, `application-icon-${now()}${extension}`)
  const temporary = `${target}.tmp`
  await fs.mkdir(directory, { recursive: true })
  try {
    await fs.copyFile(source, temporary)
    await fs.rename(temporary, target)
    return target
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

async function installSecondaryDisplayBackground({ fs, nativeImage, source, userDataPath, now = Date.now }) {
  const extension = path.extname(source || '').toLowerCase()
  if (!SUPPORTED_BACKGROUND_EXTENSIONS.has(extension)) {
    throw new Error('副屏背景仅支持 PNG、JPG、JPEG、WEBP、BMP、GIF 或 AVIF 图片')
  }
  const stat = await fs.stat(source)
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BACKGROUND_BYTES) {
    throw new Error('副屏背景图片必须是 20MB 以内的有效文件')
  }
  const image = nativeImage.createFromPath(source)
  if (!image || image.isEmpty()) throw new Error('无法解析所选副屏背景图片')
  const png = image.toPNG()
  if (!png || png.length === 0 || png.length > MAX_BACKGROUND_BYTES) {
    throw new Error('副屏背景图片处理后超过 20MB')
  }

  const directory = path.join(userDataPath, 'branding')
  const target = path.join(directory, 'secondary-display-background.png')
  const temporary = `${target}.${now()}.tmp`
  await fs.mkdir(directory, { recursive: true })
  try {
    await fs.writeFile(temporary, png)
    await fs.rename(temporary, target)
    return target
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

async function installSecondaryIdleMedia({ fs, nativeImage, source, userDataPath, now = Date.now }) {
  const extension = path.extname(source || '').toLowerCase()
  if (!SUPPORTED_IDLE_MEDIA_EXTENSIONS.has(extension)) {
    throw new Error('副屏待机画面仅支持 PNG、JPG、JPEG、WEBP、BMP、GIF、AVIF 或 MP4 等视频文件')
  }
  const stat = await fs.stat(source)
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_IDLE_MEDIA_BYTES) {
    throw new Error('副屏待机画面必须是 200MB 以内的有效文件')
  }
  if (SUPPORTED_BACKGROUND_EXTENSIONS.has(extension)) {
    const image = nativeImage.createFromPath(source)
    if (!image || image.isEmpty()) throw new Error('无法解析所选副屏待机画面')
  }

  const directory = path.join(userDataPath, 'branding')
  const target = path.join(directory, `secondary-idle-media-${now()}${extension}`)
  const temporary = `${target}.tmp`
  await fs.mkdir(directory, { recursive: true })
  try {
    await fs.copyFile(source, temporary)
    await fs.rename(temporary, target)
    return target
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

module.exports = {
  MAX_BACKGROUND_BYTES,
  MAX_ICON_BYTES,
  applyApplicationBrand,
  installApplicationIcon,
  installSecondaryDisplayBackground,
  installSecondaryIdleMedia,
  MAX_IDLE_MEDIA_BYTES,
  SUPPORTED_BACKGROUND_EXTENSIONS,
  SUPPORTED_IDLE_MEDIA_EXTENSIONS,
  toPublicApplicationSettings,
}
