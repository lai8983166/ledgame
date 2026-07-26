const DEFAULT_FRAME_SIZE = Object.freeze({ width: 16, height: 16 })

function inferFrameSize(byteLength, ...preferredSizes) {
  const bytes = Number(byteLength)
  const pixelCount = Number.isInteger(bytes) && bytes > 0 && bytes % 3 === 0
    ? bytes / 3
    : 0

  for (const candidate of preferredSizes) {
    const width = positiveInteger(candidate?.width)
    const height = positiveInteger(candidate?.height)
    if (pixelCount > 0 && width * height === pixelCount) {
      return { width, height }
    }
  }

  const squareSize = Math.sqrt(pixelCount)
  if (Number.isInteger(squareSize) && squareSize > 0) {
    return { width: squareSize, height: squareSize }
  }
  return { ...DEFAULT_FRAME_SIZE }
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

module.exports = {
  DEFAULT_FRAME_SIZE,
  inferFrameSize,
}
