const fs = require('node:fs/promises')
const { constants } = require('node:fs')
const path = require('node:path')

function validateFolderName(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()
      || value.startsWith('.') || /[<>:"/\\|?*\x00-\x1f]/.test(value)
      || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
      || value.length > 120) throw new Error('文件夹名称无效，请勿使用路径、特殊字符或系统保留名称')
  return value
}

async function resolveLibraryFolder(root, folder = '') {
  if (typeof folder !== 'string' || path.isAbsolute(folder)) throw new Error('媒体目标目录无效')
  const parts = folder ? folder.replace(/\\/g, '/').split('/') : []
  parts.forEach(validateFolderName)
  await fs.mkdir(root, { recursive: true })
  const realRoot = await fs.realpath(root)
  const target = await fs.realpath(path.join(realRoot, ...parts))
  const relative = path.relative(realRoot, target)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('媒体目标目录超出媒体库范围')
  }
  if (!(await fs.stat(target)).isDirectory()) throw new Error('媒体目标不是文件夹')
  return { target, relative:parts.join('/') }
}

async function createLibraryFolder(root, folder, name) {
  validateFolderName(name)
  const parent = await resolveLibraryFolder(root, folder)
  // Non-recursive creation deliberately fails on an existing directory or link.
  await fs.mkdir(path.join(parent.target, name))
  return { relativePath:[parent.relative, name].filter(Boolean).join('/') }
}

async function importMediaFiles(root, folder, sources, isSupported) {
  if (!Array.isArray(sources) || !sources.length) return { imported:[], failures:[] }
  const parent = await resolveLibraryFolder(root, folder)
  // Validate the whole selection before copying any file.
  for (const source of sources) {
    if (typeof source !== 'string' || !path.isAbsolute(source) || !isSupported(source)) {
      throw new Error('请选择图片、音频或视频文件')
    }
    if (!(await fs.stat(source)).isFile()) throw new Error('上传来源不是文件')
  }
  const imported = [], failures = []
  for (const source of sources) {
    const name = path.basename(source), extension = path.extname(name), stem = name.slice(0, name.length - extension.length)
    try {
      let copied = false
      for (let index = 0; index < 10000; index++) {
        const candidate = index ? `${stem} (${index})${extension}` : name
        try {
          await fs.copyFile(source, path.join(parent.target, candidate), constants.COPYFILE_EXCL)
          imported.push([parent.relative, candidate].filter(Boolean).join('/'))
          copied = true
          break
        } catch (error) { if (error.code !== 'EEXIST') throw error }
      }
      if (!copied) throw new Error('同名文件过多，无法生成新文件名')
    } catch (error) { failures.push({ name, message:error.message }) }
  }
  return { imported, failures }
}

module.exports = { createLibraryFolder, importMediaFiles, resolveLibraryFolder }
