const DEFAULT_MAX_GAP_MS = 100
const DEFAULT_MIN_LENGTH = 6
const DEFAULT_MAX_LENGTH = 32

function createKeyboardWristbandReader(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now
  const maxGapMs = positiveInteger(options.maxGapMs, DEFAULT_MAX_GAP_MS)
  const minLength = positiveInteger(options.minLength, DEFAULT_MIN_LENGTH)
  const maxLength = positiveInteger(options.maxLength, DEFAULT_MAX_LENGTH)
  let buffer = ''
  let lastKeyAt = null

  function reset() {
    buffer = ''
    lastKeyAt = null
  }

  function push(input) {
    if (!input || input.type !== 'keyDown' || input.isAutoRepeat) {
      return { consumed: false, wristbandId: null }
    }

    const key = String(input.key || '')
    const currentTime = Number(now())
    if (
      buffer &&
      Number.isFinite(currentTime) &&
      Number.isFinite(lastKeyAt) &&
      currentTime - lastKeyAt > maxGapMs
    ) {
      reset()
    }

    if (key === 'Enter') {
      const wristbandId =
        buffer.length >= minLength && buffer.length <= maxLength && /^\d+$/.test(buffer)
          ? buffer
          : null
      const consumed = buffer.length > 0
      reset()
      return { consumed, wristbandId }
    }

    if (!/^\d$/.test(key)) {
      if (buffer) {
        reset()
      }
      return { consumed: false, wristbandId: null }
    }

    if (buffer.length >= maxLength) {
      reset()
      return { consumed: true, wristbandId: null }
    }

    buffer += key
    lastKeyAt = currentTime
    return { consumed: true, wristbandId: null }
  }

  return { push, reset }
}

function normalizeWristbandId(value, options = {}) {
  const minLength = positiveInteger(options.minLength, DEFAULT_MIN_LENGTH)
  const maxLength = positiveInteger(options.maxLength, DEFAULT_MAX_LENGTH)
  const wristbandId = String(value ?? '').trim()
  if (
    wristbandId.length < minLength ||
    wristbandId.length > maxLength ||
    !/^\d+$/.test(wristbandId)
  ) {
    return null
  }
  return wristbandId
}

function positiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

module.exports = {
  createKeyboardWristbandReader,
  normalizeWristbandId,
}
