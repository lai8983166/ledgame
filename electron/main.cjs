const path = require('node:path')
const childProcess = require('node:child_process')
const nodeNet = require('node:net')
const nodeFs = require('node:fs')
const fs = require('node:fs/promises')
const { pathToFileURL } = require('node:url')
const { app, BrowserWindow, dialog, ipcMain, protocol, net: electronNet, screen } = require('electron')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const shouldUseEmbeddedBackend = !isDev && !process.env.LED_BACKEND_URL
const preferredBackendPort = Number(process.env.LED_PORTABLE_BACKEND_PORT || 37680)
const framePort = Number(process.env.LED_DEBUG_TCP_PORT || 3002)
const runtimeStateThrottleMs = Number(process.env.LED_RUNTIME_STATE_THROTTLE_MS || 100)
const mediaProtocol = 'led-media'
const mediaRootName = 'media'
const imageExtensions = new Set(['.apng', '.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const videoExtensions = new Set(['.m4v', '.mov', '.mp4', '.ogg', '.ogv', '.webm'])

protocol.registerSchemesAsPrivileged([
  {
    scheme: mediaProtocol,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

if (process.env.LED_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.LED_USER_DATA_DIR))
}

try {
  const earlyLogDir = path.join(app.getPath('userData'), 'logs')
  nodeFs.mkdirSync(earlyLogDir, { recursive: true })
  nodeFs.appendFileSync(path.join(earlyLogDir, 'startup.log'), `[${new Date().toISOString()}] Electron main loaded\n`, 'utf8')
} catch (_error) {
  // Best-effort startup marker only.
}

let mainWindow
let debugWindow
let backendBaseUrl = process.env.LED_BACKEND_URL || 'http://127.0.0.1:8080'
let runtimeStateStreamUrl = process.env.LED_RUNTIME_STATE_URL || defaultRuntimeStateStreamUrl(backendBaseUrl)
let latestFrame = null
let tcpServer = null
let runtimeStateSocket = null
let runtimeStateReconnectTimer = null
let runtimeStateStreamStopped = false
let pendingRuntimeState = null
let runtimeStatePublishTimer = null
let embeddedBackendProcess = null
let embeddedBackendLogFd = null
let NodeWebSocket = null

function appendStartupLog(message) {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs')
    nodeFs.mkdirSync(logsDir, { recursive: true })
    nodeFs.appendFileSync(
      path.join(logsDir, 'startup.log'),
      `[${new Date().toISOString()}] ${message}\n`,
      'utf8',
    )
  } catch (_error) {
    // Logging must never make startup fail.
  }
}

function defaultRuntimeStateStreamUrl(baseUrl) {
  try {
    const url = new URL('/ws/runtime', baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.toString()
  } catch (_error) {
    return 'ws://127.0.0.1:8080/ws/runtime'
  }
}

function setBackendBaseUrl(baseUrl) {
  backendBaseUrl = baseUrl
  if (!process.env.LED_RUNTIME_STATE_URL) {
    runtimeStateStreamUrl = defaultRuntimeStateStreamUrl(baseUrl)
  }
}

function resolveWindowBounds({ targetWidth, targetHeight, minWidth, minHeight }) {
  // workArea is in DIPs, which equals the CSS pixels the renderer sees, so the
  // renderer's clientWidth/clientHeight measurements line up with these numbers.
  const work = screen.getPrimaryDisplay().workArea
  const availWidth = Math.max(0, work.width)
  const availHeight = Math.max(0, work.height)

  const width = Math.max(minWidth, Math.min(targetWidth, availWidth))
  const height = Math.max(minHeight, Math.min(targetHeight, availHeight))
  const x = work.x + Math.max(0, Math.floor((availWidth - width) / 2))
  const y = work.y + Math.max(0, Math.floor((availHeight - height) / 2))

  return {
    width,
    height,
    x,
    y,
    minWidth: Math.min(minWidth, availWidth || minWidth),
    minHeight: Math.min(minHeight, availHeight || minHeight),
  }
}

function createWindow() {
  const bounds = resolveWindowBounds({
    targetWidth: 1480,
    targetHeight: 900,
    minWidth: 1100,
    minHeight: 720,
  })

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    x: bounds.x,
    y: bounds.y,
    // width/height then describe the page area (what fit-viewport measures),
    // removing the ~30px Windows frame gap that previously clipped the right edge.
    useContentSize: true,
    center: true,
    // Start hidden, maximize, then show on ready-to-show so the app opens maximized
    // without a small-then-maximized flicker. The bounds above become the restore size.
    show: false,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep the renderer at 1:1 CSS px so it matches workArea DIPs; prevents
      // OS display scaling from being read as zoom and re-introducing clipping.
      zoomFactor: 1.0,
    },
  })
  mainWindow.setAutoHideMenuBar(true)
  mainWindow.maximize()
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function createDebugWindow() {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.focus()
    return
  }

  const bounds = resolveWindowBounds({
    targetWidth: 1380,
    targetHeight: 920,
    minWidth: 720,
    minHeight: 640,
  })

  debugWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    x: bounds.x,
    y: bounds.y,
    useContentSize: true,
    center: true,
    title: 'LED Debug Panel',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1.0,
    },
  })
  debugWindow.setAutoHideMenuBar(true)

  debugWindow.on('closed', () => {
    debugWindow = null
  })

  if (isDev) {
    debugWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?window=debug`)
  } else {
    debugWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { window: 'debug' },
    })
  }

  debugWindow.webContents.once('did-finish-load', () => {
    if (latestFrame) {
      debugWindow.webContents.send('led-frame', latestFrame)
    }
  })
}

function startFrameServer() {
  if (tcpServer) {
    return
  }

  tcpServer = nodeNet.createServer((socket) => {
    let buffer = Buffer.alloc(0)

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      buffer = parseFrames(buffer)
    })
  })

  tcpServer.on('error', (error) => {
    console.error(`LED debug TCP server failed on port ${framePort}`, error)
  })

  tcpServer.listen(framePort, '127.0.0.1', () => {
    console.log(`LED debug TCP server listening on 127.0.0.1:${framePort}`)
  })
}

function parseFrames(buffer) {
  let offset = 0

  while (buffer.length - offset >= 5) {
    if (buffer[offset] !== 0x67) {
      offset += 1
      continue
    }

    const length = buffer.readUInt32BE(offset + 1)
    const frameEnd = offset + 5 + length
    if (buffer.length < frameEnd) {
      break
    }

    const payload = buffer.subarray(offset + 5, frameEnd)
    publishFrame(payload)
    offset = frameEnd
  }

  return buffer.subarray(offset)
}

function publishFrame(payload) {
  const rgb = Array.from(payload)
  const frameSize = inferFrameSize(rgb.length)
  latestFrame = {
    width: frameSize.width,
    height: frameSize.height,
    rgb,
    receivedAt: Date.now(),
  }

  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.webContents.send('led-frame', latestFrame)
  }
}

function inferFrameSize(byteLength) {
  const pixelCount = Math.floor((Number(byteLength) || 0) / 3)
  const squareSize = Math.sqrt(pixelCount)
  if (Number.isInteger(squareSize) && squareSize > 0) {
    return { width: squareSize, height: squareSize }
  }
  return { width: 16, height: 16 }
}

function publishEngineState(state) {
  if (!state) {
    return
  }

  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('engine-state', state)
    }
  })
}

function scheduleEngineStatePublish(state) {
  if (!state) {
    return
  }
  const throttleMs = Number.isFinite(runtimeStateThrottleMs)
    ? Math.max(0, runtimeStateThrottleMs)
    : 100
  if (throttleMs === 0) {
    publishEngineState(state)
    return
  }
  pendingRuntimeState = state
  if (runtimeStatePublishTimer) {
    return
  }
  runtimeStatePublishTimer = setTimeout(() => {
    const latestState = pendingRuntimeState
    pendingRuntimeState = null
    runtimeStatePublishTimer = null
    publishEngineState(latestState)
  }, throttleMs)
}

function startRuntimeStateStream() {
  if (!runtimeStateStreamUrl || runtimeStateSocket || runtimeStateReconnectTimer) {
    return
  }
  runtimeStateStreamStopped = false
  connectRuntimeStateStream()
}

function connectRuntimeStateStream() {
  if (runtimeStateStreamStopped || !runtimeStateStreamUrl || runtimeStateSocket) {
    return
  }
  const WebSocketClient = typeof globalThis.WebSocket === 'function' ? globalThis.WebSocket : getNodeWebSocket()
  if (typeof WebSocketClient !== 'function') {
    console.warn('Runtime state stream unavailable: WebSocket is not supported in Electron main')
    return
  }

  try {
    runtimeStateSocket = new WebSocketClient(runtimeStateStreamUrl)
  } catch (error) {
    runtimeStateSocket = null
    console.warn(`Runtime state stream connection failed: ${error.message || String(error)}`)
    scheduleRuntimeStateReconnect()
    return
  }

  addRuntimeSocketListener(runtimeStateSocket, 'message', (eventOrData) => {
    handleRuntimeStateMessage(extractSocketMessageData(eventOrData))
  })
  addRuntimeSocketListener(runtimeStateSocket, 'close', () => {
    runtimeStateSocket = null
    scheduleRuntimeStateReconnect()
  })
  addRuntimeSocketListener(runtimeStateSocket, 'error', () => {
    if (runtimeStateSocket) {
      runtimeStateSocket.close()
    }
  })
}

function getNodeWebSocket() {
  if (NodeWebSocket) {
    return NodeWebSocket
  }
  try {
    NodeWebSocket = require('ws')
    return NodeWebSocket
  } catch (error) {
    appendStartupLog(`Runtime state stream unavailable: ${error.message || String(error)}`)
    return null
  }
}

function addRuntimeSocketListener(socket, eventName, listener) {
  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(eventName, listener)
    return
  }
  socket.on(eventName, listener)
}

function extractSocketMessageData(eventOrData) {
  if (eventOrData && typeof eventOrData === 'object' && 'data' in eventOrData) {
    return eventOrData.data
  }
  return eventOrData
}

function scheduleRuntimeStateReconnect() {
  if (runtimeStateStreamStopped || !runtimeStateStreamUrl || runtimeStateReconnectTimer) {
    return
  }
  runtimeStateReconnectTimer = setTimeout(() => {
    runtimeStateReconnectTimer = null
    connectRuntimeStateStream()
  }, 2000)
}

function stopRuntimeStateStream() {
  runtimeStateStreamStopped = true
  if (runtimeStateReconnectTimer) {
    clearTimeout(runtimeStateReconnectTimer)
    runtimeStateReconnectTimer = null
  }
  if (runtimeStatePublishTimer) {
    clearTimeout(runtimeStatePublishTimer)
    runtimeStatePublishTimer = null
    pendingRuntimeState = null
  }
  if (runtimeStateSocket) {
    const socket = runtimeStateSocket
    runtimeStateSocket = null
    socket.close()
  }
}

function handleRuntimeStateMessage(message) {
  try {
    const response = parseRuntimeStateMessage(message)
    if (!response || response.action !== 12 || !response.data) {
      return
    }
    scheduleEngineStatePublish(response.data)
  } catch (error) {
    console.warn(`Invalid runtime state message ignored: ${error.message || String(error)}`)
  }
}

function parseRuntimeStateMessage(message) {
  if (Buffer.isBuffer(message)) {
    return JSON.parse(message.toString('utf8'))
  }
  if (message instanceof ArrayBuffer) {
    return JSON.parse(Buffer.from(message).toString('utf8'))
  }
  if (ArrayBuffer.isView(message)) {
    return JSON.parse(Buffer.from(message.buffer, message.byteOffset, message.byteLength).toString('utf8'))
  }
  if (typeof message === 'string') {
    return JSON.parse(message)
  }
  return null
}

async function backendRequest(pathname, options = {}) {
  const response = await fetch(`${backendBaseUrl}${pathname}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(data?.message || `Backend request failed: ${response.status}`)
  }
  return data
}

function getResourcesPath() {
  return app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..', 'build-resources')
}

function getEmbeddedBackendJarPath() {
  return path.join(getResourcesPath(), 'backend', 'ledGame-backend.jar')
}

function getEmbeddedJavaPath() {
  return path.join(getResourcesPath(), 'jre', 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
}

function getSeedDatabaseRuntimeDir() {
  return path.join(getResourcesPath(), 'seed-database', 'runtime')
}

function getUserDatabaseRuntimeDir() {
  return path.join(app.getPath('userData'), 'database', 'runtime')
}

function getUserDatabaseBasePath() {
  return path.join(getUserDatabaseRuntimeDir(), 'ledgame')
}

function getUserDatabaseFilePath() {
  return `${getUserDatabaseBasePath()}.mv.db`
}

function getPackagedMediaRoot() {
  return path.join(getResourcesPath(), mediaRootName)
}

async function prepareUserDatabase() {
  const userDatabaseFile = getUserDatabaseFilePath()
  await fs.mkdir(getUserDatabaseRuntimeDir(), { recursive: true })
  if (nodeFs.existsSync(userDatabaseFile)) {
    return
  }

  const seedRuntimeDir = getSeedDatabaseRuntimeDir()
  if (!nodeFs.existsSync(seedRuntimeDir)) {
    console.warn(`Seed database directory not found: ${seedRuntimeDir}`)
    return
  }

  const entries = await fs.readdir(seedRuntimeDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mv.db')) {
      continue
    }
    await fs.copyFile(
      path.join(seedRuntimeDir, entry.name),
      path.join(getUserDatabaseRuntimeDir(), entry.name),
    )
  }
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = nodeNet.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function findAvailablePort(startPort, attempts = 40) {
  const normalizedStartPort = Number.isFinite(startPort) && startPort > 0 ? startPort : 37680
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = normalizedStartPort + offset
    if (await isPortAvailable(port)) {
      return port
    }
  }
  throw new Error(`No available backend port found from ${normalizedStartPort} to ${normalizedStartPort + attempts - 1}`)
}

async function waitForBackend(baseUrl, timeoutMs = 30000) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl)
      if (response) {
        return
      }
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 350))
  }
  throw new Error(`Embedded backend did not become ready: ${lastError?.message || 'timeout'}`)
}

async function startEmbeddedBackend() {
  if (!shouldUseEmbeddedBackend || embeddedBackendProcess) {
    appendStartupLog('Embedded backend skipped')
    return
  }

  const backendJarPath = getEmbeddedBackendJarPath()
  const javaPath = getEmbeddedJavaPath()
  appendStartupLog(`Starting embedded backend with jar=${backendJarPath} java=${javaPath}`)
  if (!nodeFs.existsSync(backendJarPath)) {
    throw new Error(`Embedded backend jar not found: ${backendJarPath}`)
  }
  if (!nodeFs.existsSync(javaPath)) {
    throw new Error(`Embedded Java runtime not found: ${javaPath}`)
  }

  await prepareUserDatabase()

  const backendPort = await findAvailablePort(preferredBackendPort)
  const selectedBackendBaseUrl = `http://127.0.0.1:${backendPort}`
  const mediaRoot = getPackagedMediaRoot()
  setBackendBaseUrl(selectedBackendBaseUrl)
  appendStartupLog(`Embedded backend selected port ${backendPort}`)

  const logsDir = path.join(app.getPath('userData'), 'logs')
  await fs.mkdir(logsDir, { recursive: true })
  embeddedBackendLogFd = nodeFs.openSync(path.join(logsDir, 'backend.log'), 'a')

  embeddedBackendProcess = childProcess.spawn(javaPath, ['-jar', backendJarPath], {
    cwd: app.getPath('userData'),
    windowsHide: true,
    stdio: ['ignore', embeddedBackendLogFd, embeddedBackendLogFd],
    env: {
      ...process.env,
      SERVER_PORT: String(backendPort),
      SPRING_DATASOURCE_URL: `jdbc:h2:file:${getUserDatabaseBasePath()};MODE=MySQL;DATABASE_TO_LOWER=TRUE`,
      LED_MEDIA_ROOT: mediaRoot,
      LED_BRIDGE_ENABLED: process.env.LED_BRIDGE_ENABLED || 'false',
    },
  })

  embeddedBackendProcess.once('exit', (code, signal) => {
    const message = `Embedded backend exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`
    console.warn(message)
    appendStartupLog(message)
    embeddedBackendProcess = null
    if (embeddedBackendLogFd !== null) {
      nodeFs.closeSync(embeddedBackendLogFd)
      embeddedBackendLogFd = null
    }
  })

  await waitForBackend(selectedBackendBaseUrl)
  appendStartupLog('Embedded backend is ready')
}

function stopEmbeddedBackend() {
  if (!embeddedBackendProcess) {
    return
  }
  const processToStop = embeddedBackendProcess
  embeddedBackendProcess = null
  processToStop.kill()
  if (embeddedBackendLogFd !== null) {
    nodeFs.closeSync(embeddedBackendLogFd)
    embeddedBackendLogFd = null
  }
}

function handleStartupFailure(error) {
  const message = error?.message || String(error)
  console.error(`Application startup failed: ${message}`)
  appendStartupLog(`Application startup failed: ${message}`)
  dialog.showErrorBox('LED Game 启动失败', message)
  app.quit()
}

async function engineStateRequest(pathname, options = {}) {
  const result = await backendRequest(pathname, options)
  publishEngineState(result?.data)
  return result
}

function normalizeGameStartRequest(request) {
  const source = request && typeof request === 'object' ? request : { id: request }
  const id = Number(source.id ?? source.gameId)
  const startLevelIndex = Number(source.startLevelIndex ?? 0)
  if (!Number.isFinite(id)) {
    throw new Error('Game id is required')
  }
  return {
    id,
    icList: Array.isArray(source.icList) ? source.icList : [],
    userCount: source.userCount ?? null,
    startLevelIndex: Number.isFinite(startLevelIndex) ? startLevelIndex : 0,
    tokenList: Array.isArray(source.tokenList) ? source.tokenList : [],
    isAdmin: source.isAdmin ?? false,
    launchMethod: source.launchMethod || 'debug',
  }
}

function getMediaRoot() {
  return path.resolve(process.env.LED_MEDIA_DIR || getDefaultMediaRoot())
}

function getDefaultMediaRoot() {
  if (app.isPackaged) {
    return getPackagedMediaRoot()
  }
  const frontendRoot = app.getAppPath()
  const backendMediaRoot = path.resolve(frontendRoot, '../ledGame-backend', mediaRootName)
  if (nodeFs.existsSync(backendMediaRoot)) {
    return backendMediaRoot
  }
  return path.join(frontendRoot, mediaRootName)
}

function toMediaRelativePath(value) {
  if (typeof value !== 'string') {
    throw new Error('Media path is required')
  }
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('\0')) {
    throw new Error('Media path is required')
  }
  return normalized
}

function resolveMediaPath(relativePath) {
  const mediaRoot = getMediaRoot()
  const normalizedRelativePath = toMediaRelativePath(relativePath)
  const resolvedPath = path.resolve(mediaRoot, normalizedRelativePath)
  const relativeFromRoot = path.relative(mediaRoot, resolvedPath)
  if (
    relativeFromRoot === '' ||
    relativeFromRoot.startsWith('..') ||
    path.isAbsolute(relativeFromRoot)
  ) {
    throw new Error('Media path is outside the media directory')
  }
  return resolvedPath
}

function toPortableRelativePath(value) {
  return value.split(path.sep).join('/')
}

function getMediaKind(fileName) {
  const extension = path.extname(fileName).toLowerCase()
  if (imageExtensions.has(extension)) {
    return 'image'
  }
  if (videoExtensions.has(extension)) {
    return 'video'
  }
  return 'file'
}

function isPreviewableMediaKind(mediaType) {
  return mediaType === 'image' || mediaType === 'video'
}

async function readMediaDirectory(directoryPath, relativeBase = '') {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  const nodes = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }
    const childRelativePath = relativeBase
      ? `${relativeBase}/${entry.name}`
      : entry.name
    const childPath = path.join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        kind: 'directory',
        relativePath: childRelativePath,
        mediaType: 'directory',
        previewable: false,
        children: await readMediaDirectory(childPath, childRelativePath),
      })
      continue
    }

    if (entry.isFile()) {
      const mediaType = getMediaKind(entry.name)
      nodes.push({
        name: entry.name,
        kind: 'file',
        relativePath: childRelativePath,
        mediaType,
        previewable: isPreviewableMediaKind(mediaType),
        children: [],
      })
    }
  }

  nodes.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })

  return nodes
}

async function listMediaLibrary() {
  const mediaRoot = getMediaRoot()
  try {
    const stat = await fs.stat(mediaRoot)
    if (!stat.isDirectory()) {
      return {
        rootName: mediaRootName,
        exists: false,
        items: [],
      }
    }
    return {
      rootName: mediaRootName,
      exists: true,
      items: await readMediaDirectory(mediaRoot),
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        rootName: mediaRootName,
        exists: false,
        items: [],
      }
    }
    throw new Error(`Unable to read media directory: ${error.message || String(error)}`)
  }
}

async function getMediaPreviewUrl(relativePath) {
  const resolvedPath = resolveMediaPath(relativePath)
  const stat = await fs.stat(resolvedPath)
  if (!stat.isFile()) {
    throw new Error('Media preview target is not a file')
  }
  const mediaType = getMediaKind(resolvedPath)
  if (!isPreviewableMediaKind(mediaType)) {
    throw new Error('Media file is not previewable')
  }
  const portablePath = toPortableRelativePath(path.relative(getMediaRoot(), resolvedPath))
  const encodedPath = portablePath.split('/').map(encodeURIComponent).join('/')
  return {
    url: `${mediaProtocol}://preview/${encodedPath}`,
    mediaType,
  }
}

function registerMediaProtocol() {
  protocol.handle(mediaProtocol, async (request) => {
    const requestUrl = new URL(request.url)
    const relativePath = decodeURIComponent(requestUrl.pathname.replace(/^\/+/, ''))
    const resolvedPath = resolveMediaPath(relativePath)
    const stat = await fs.stat(resolvedPath)
    if (!stat.isFile() || !isPreviewableMediaKind(getMediaKind(resolvedPath))) {
      return new Response('Media file is not previewable', { status: 404 })
    }
    return electronNet.fetch(pathToFileURL(resolvedPath).toString())
  })
}

ipcMain.handle('open-debug-panel', () => {
  createDebugWindow()
})

ipcMain.handle('frame:latest', () => latestFrame)
ipcMain.handle('engine:start-fixed', () => engineStateRequest('/engine/demo/fixed/start', { method: 'POST' }))
ipcMain.handle('engine:start-input', () => engineStateRequest('/engine/demo/input/start', { method: 'POST' }))
ipcMain.handle('engine:start-game', (_event, request) =>
  engineStateRequest('/game/start', {
    method: 'POST',
    body: JSON.stringify(normalizeGameStartRequest(request)),
  }),
)
ipcMain.handle('engine:stop-game', () => engineStateRequest('/engine/game/stop', { method: 'POST' }))
ipcMain.handle('engine:game-state', () =>
  engineStateRequest('/engine/game/input', {
    method: 'POST',
    body: JSON.stringify({ type: 'state' }),
  }),
)
ipcMain.handle('engine:game-input', (_event, input) =>
  engineStateRequest('/engine/game/input', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
)
ipcMain.handle('engine:stop', () => engineStateRequest('/engine/demo/stop', { method: 'POST' }))
ipcMain.handle('engine:state', () => engineStateRequest('/engine/demo/state'))
ipcMain.handle('engine:input', (_event, input) =>
  backendRequest('/engine/demo/input', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
)
ipcMain.handle('dev:seed-simple-demo', () =>
  backendRequest('/dev/seed/simple-demo', { method: 'POST' }),
)
ipcMain.handle('game-editor:get', (_event, gameId) =>
  backendRequest(`/game-editor/${gameId}`),
)
ipcMain.handle('game-editor:validate', (_event, document) =>
  backendRequest('/game-editor/validate', {
    method: 'POST',
    body: JSON.stringify(document),
  }),
)
ipcMain.handle('game-editor:save', (_event, gameId, document) =>
  backendRequest(`/game-editor/${gameId}`, {
    method: 'PUT',
    body: JSON.stringify(document),
  }),
)
ipcMain.handle('spirit:list', () => backendRequest('/spirit/simpleListSpirits'))
ipcMain.handle('media:list', () => listMediaLibrary())
ipcMain.handle('media:get-preview-url', (_event, relativePath) => getMediaPreviewUrl(relativePath))

app.whenReady()
  .then(async () => {
    registerMediaProtocol()
    await startEmbeddedBackend()
    startFrameServer()
    startRuntimeStateStream()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
  .catch(handleStartupFailure)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopRuntimeStateStream()
  if (tcpServer) {
    tcpServer.close()
  }
  stopEmbeddedBackend()
})
