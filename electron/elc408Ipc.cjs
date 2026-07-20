// ELC-408 IPC request body normalizers. Pure CommonJS so they can be required
// from both main.cjs and tests/*.test.mjs without a build step.

const ELC408_RGB_MODES = new Set(['RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR'])
const ELC408_CONTROLLER_MODELS = new Set(['HC08', 'HC04'])

function clampFiniteInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    return fallback
  }
  if (Number.isFinite(min) && n < min) {
    return min
  }
  if (Number.isFinite(max) && n > max) {
    return max
  }
  return Math.floor(n)
}

function normalizeConfigDraft(draft) {
  const source = draft && typeof draft === 'object' ? draft : {}
  const networkInterfaceId = typeof source.networkInterfaceId === 'string'
    ? source.networkInterfaceId
    : ''
  const controllerModel = ELC408_CONTROLLER_MODELS.has(String(source.controllerModel).toUpperCase())
    ? String(source.controllerModel).toUpperCase()
    : 'HC08'
  const rgbMode = ELC408_RGB_MODES.has(String(source.rgbMode).toUpperCase())
    ? String(source.rgbMode).toUpperCase()
    : 'RGB'
  return {
    tcpServerPort: clampFiniteInt(source.tcpServerPort, 3002, 1, 65535),
    allowRepeatActiveOnDown: Boolean(source.allowRepeatActiveOnDown),
    debounceMillis: clampFiniteInt(source.debounceMillis, 50, 0, 60000),
    networkInterfaceId,
    controllerModel,
    rgbMode,
  }
}

function normalizeWiringDraft(document) {
  const source = document && typeof document === 'object' ? document : {}
  const width = clampFiniteInt(source.width, 16, 1, 1024)
  const height = clampFiniteInt(source.height, 16, 1, 1024)
  const maxPointsPerChannel = clampFiniteInt(source.maxPointsPerChannel, 64, 1, 170)
  const rawLines = Array.isArray(source.lines) ? source.lines : []
  const lines = rawLines.map((line) => {
    if (!Array.isArray(line)) {
      return []
    }
    return line
      .map((point) => {
        if (!Array.isArray(point) || point.length !== 2) {
          return null
        }
        const x = Number(point[0])
        const y = Number(point[1])
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
          return null
        }
        return [x, y]
      })
      .filter(Boolean)
  })
  return {
    width,
    height,
    maxPointsPerChannel,
    lines,
  }
}

function normalizeSearchRequest(request) {
  const source = request && typeof request === 'object' ? request : {}
  const result = {}
  if (typeof source.networkInterfaceId === 'string' && source.networkInterfaceId) {
    result.networkInterfaceId = source.networkInterfaceId
  }
  const model = String(source.controllerModel).toUpperCase()
  if (ELC408_CONTROLLER_MODELS.has(model)) {
    result.controllerModel = model
  }
  return result
}

function normalizeDebugStartRequest(request) {
  const source = request && typeof request === 'object' ? request : {}
  const rgbMode = ELC408_RGB_MODES.has(String(source.rgbMode).toUpperCase())
    ? String(source.rgbMode).toUpperCase()
    : 'RGB'
  const controllerModel = ELC408_CONTROLLER_MODELS.has(String(source.controllerModel).toUpperCase())
    ? String(source.controllerModel).toUpperCase()
    : 'HC08'
  const networkInterfaceId = typeof source.networkInterfaceId === 'string'
    ? source.networkInterfaceId
    : ''
  const displayColor = source.displayColor && typeof source.displayColor === 'object'
    ? {
        r: clampFiniteInt(source.displayColor.r, 0, 0, 255),
        g: clampFiniteInt(source.displayColor.g, 0, 0, 255),
        b: clampFiniteInt(source.displayColor.b, 0, 0, 255),
      }
    : { r: 255, g: 0, b: 0 }
  return {
    rgbMode,
    networkInterfaceId,
    controllerModel,
    controllerCount: clampFiniteInt(source.controllerCount, 1, 1, 32),
    maxPointsPerChannel: clampFiniteInt(source.maxPointsPerChannel, 64, 1, 170),
    displayColor,
    frameIntervalMs: clampFiniteInt(source.frameIntervalMs, 1000, 1, 60000),
  }
}

function normalizeSaveFilePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Invalid save payload' }
  }
  const kind = payload.kind === 'wiring' ? 'wiring'
    : payload.kind === 'config' ? 'config'
    : null
  if (!kind) {
    return { ok: false, error: 'Unsupported file kind' }
  }
  const content = typeof payload.content === 'string' ? payload.content : ''
  if (!content || content.length > 256 * 1024) {
    return { ok: false, error: 'Invalid JSON content' }
  }
  const suggestedFileName = typeof payload.suggestedFileName === 'string' && payload.suggestedFileName
    ? payload.suggestedFileName
    : kind === 'wiring' ? 'wiring.json' : 'conf.json'
  if (suggestedFileName.includes('/') || suggestedFileName.includes('\\')) {
    return { ok: false, error: 'File name must not contain path separators' }
  }
  return { ok: true, kind, suggestedFileName, content }
}

module.exports = {
  ELC408_RGB_MODES,
  ELC408_CONTROLLER_MODELS,
  clampFiniteInt,
  normalizeConfigDraft,
  normalizeWiringDraft,
  normalizeSearchRequest,
  normalizeDebugStartRequest,
  normalizeSaveFilePayload,
}
