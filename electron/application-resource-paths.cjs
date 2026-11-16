const path = require('node:path')

const RESOURCE_NAMES = Object.freeze({
  applicationIconPath: /^application-icon(?:-[a-z0-9-]+)?\.(?:png|ico)$/i,
  secondaryDisplayBackgroundPath: /^secondary-display-background(?:-[a-z0-9-]+)?\.png$/i,
  secondaryIdleMediaPath: /^secondary-idle-media(?:-[a-z0-9-]+)?\.(?:apng|avif|bmp|gif|jpe?g|png|webp|m4v|mov|mp4|ogg|ogv|webm)$/i,
})

function createApplicationResourcePaths(resourceRoot) {
  const root = path.resolve(resourceRoot)
  const directory = path.join(root, 'branding')

  function resolve(field, value, strict) {
    if (value === null || value === undefined) return null
    const fail = () => {
      if (strict) throw new Error(`${field} must refer to a managed file in this package's branding directory`)
      return null
    }
    if (typeof value !== 'string' || !value.trim()) return fail()
    const raw = value.trim()
    const portable = raw.replace(/\\/g, '/')
    const segments = portable.split('/')
    if (segments.includes('..') || segments.includes('.')) return fail()
    const name = segments.at(-1)
    if (!RESOURCE_NAMES[field].test(name)) return fail()
    const absolute = path.isAbsolute(raw) || path.win32.isAbsolute(raw)
    if (!absolute) {
      if (segments.length !== 2 || segments[0] !== 'branding') return fail()
    } else if (strict) {
      // IPC saves may only name a file already copied into this package.
      if (path.relative(directory, path.dirname(path.resolve(raw))) !== '') return fail()
    } else if (segments.at(-2)?.toLowerCase() !== 'branding') {
      return fail()
    }
    // Old JSON may contain an absolute path from a copied or moved package.
    // Rebase its managed filename here, even if the original still exists.
    return path.join(directory, name)
  }

  function hydrate(value, { strict = false } = {}) {
    const result = { ...(value && typeof value === 'object' ? value : {}) }
    for (const field of Object.keys(RESOURCE_NAMES)) {
      if (Object.hasOwn(result, field)) result[field] = resolve(field, result[field], strict)
    }
    return result
  }

  function serialize(value) {
    const result = { ...value }
    for (const field of Object.keys(RESOURCE_NAMES)) {
      const resolved = resolve(field, result[field], true)
      result[field] = resolved ? path.relative(root, resolved).split(path.sep).join('/') : null
    }
    return result
  }

  return { hydrate, serialize }
}

module.exports = { createApplicationResourcePaths }
