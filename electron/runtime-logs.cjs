const nodeFs = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const { Writable } = require('node:stream')

const MIB = 1024 * 1024

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function resolveRuntimeLogOptions(env = process.env) {
  return {
    startupMaxBytes: boundedInteger(env.LED_STARTUP_LOG_MAX_BYTES, 2 * MIB, 1024, 1024 * MIB),
    startupHistory: boundedInteger(env.LED_STARTUP_LOG_HISTORY, 2, 0, 20),
    backendMaxBytes: boundedInteger(env.LED_BACKEND_LOG_MAX_BYTES, 10 * MIB, 1024, 1024 * MIB),
    backendHistory: boundedInteger(env.LED_BACKEND_LOG_HISTORY, 3, 0, 20),
  }
}

function rotatedPath(filePath, index) {
  return `${filePath}.${index}`
}

function ignoreMissing(error) {
  if (error?.code !== 'ENOENT') {
    throw error
  }
}

function rotateFilesSync(filePath, history) {
  if (history <= 0) {
    try {
      nodeFs.rmSync(filePath, { force: true })
    } catch (error) {
      ignoreMissing(error)
    }
    return
  }
  nodeFs.rmSync(rotatedPath(filePath, history), { force: true })
  for (let index = history - 1; index >= 1; index -= 1) {
    try {
      nodeFs.renameSync(rotatedPath(filePath, index), rotatedPath(filePath, index + 1))
    } catch (error) {
      ignoreMissing(error)
    }
  }
  try {
    nodeFs.renameSync(filePath, rotatedPath(filePath, 1))
  } catch (error) {
    ignoreMissing(error)
  }
}

async function rotateFiles(filePath, history) {
  if (history <= 0) {
    await fs.rm(filePath, { force: true })
    return
  }
  await fs.rm(rotatedPath(filePath, history), { force: true })
  for (let index = history - 1; index >= 1; index -= 1) {
    try {
      await fs.rename(rotatedPath(filePath, index), rotatedPath(filePath, index + 1))
    } catch (error) {
      ignoreMissing(error)
    }
  }
  try {
    await fs.rename(filePath, rotatedPath(filePath, 1))
  } catch (error) {
    ignoreMissing(error)
  }
}

function appendBoundedLogSync(filePath, content, options) {
  const maxBytes = options.maxBytes
  const history = options.history
  const onWarning = options.onWarning || (() => {})
  try {
    nodeFs.mkdirSync(path.dirname(filePath), { recursive: true })
    let data = Buffer.from(String(content), 'utf8')
    if (data.length > maxBytes) {
      data = data.subarray(data.length - maxBytes)
    }
    const currentSize = nodeFs.existsSync(filePath) ? nodeFs.statSync(filePath).size : 0
    if (currentSize > 0 && currentSize + data.length > maxBytes) {
      rotateFilesSync(filePath, history)
    }
    nodeFs.appendFileSync(filePath, data)
  } catch (error) {
    onWarning(error)
  }
}

class BoundedLogSink extends Writable {
  constructor(filePath, options = {}) {
    super({ highWaterMark: options.highWaterMark || 64 * 1024 })
    this.filePath = filePath
    this.maxBytes = options.maxBytes
    this.history = options.history
    this.onWarning = options.onWarning || (() => {})
    this.currentSize = options.currentSize || 0
  }

  _write(chunk, encoding, callback) {
    this.writeChunk(chunk, encoding).then(() => callback(), callback)
  }

  async writeChunk(chunk, encoding) {
    let data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
    if (data.length > this.maxBytes) {
      data = data.subarray(data.length - this.maxBytes)
    }
    try {
      if (this.currentSize > 0 && this.currentSize + data.length > this.maxBytes) {
        await rotateFiles(this.filePath, this.history)
        this.currentSize = 0
      }
      await fs.appendFile(this.filePath, data)
      this.currentSize += data.length
    } catch (error) {
      this.onWarning(error)
    }
  }

  close() {
    if (this.writableEnded || this.destroyed) {
      return Promise.resolve()
    }
    return new Promise((resolve) => this.end(resolve))
  }
}

async function createBoundedLogSink(filePath, options) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  let currentSize = 0
  try {
    currentSize = (await fs.stat(filePath)).size
  } catch (error) {
    ignoreMissing(error)
  }
  return new BoundedLogSink(filePath, { ...options, currentSize })
}

module.exports = {
  BoundedLogSink,
  appendBoundedLogSync,
  createBoundedLogSink,
  resolveRuntimeLogOptions,
  rotateFiles,
  rotateFilesSync,
}
