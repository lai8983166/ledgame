const path = require('node:path')
const net = require('node:net')
const { app, BrowserWindow, ipcMain } = require('electron')
const NodeWebSocket = require('ws')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const backendBaseUrl = process.env.LED_BACKEND_URL || 'http://127.0.0.1:8080'
const framePort = Number(process.env.LED_DEBUG_TCP_PORT || 3002)
const runtimeStateStreamUrl = process.env.LED_RUNTIME_STATE_URL || defaultRuntimeStateStreamUrl(backendBaseUrl)
const runtimeStateThrottleMs = Number(process.env.LED_RUNTIME_STATE_THROTTLE_MS || 100)

let mainWindow
let debugWindow
let latestFrame = null
let tcpServer = null
let runtimeStateSocket = null
let runtimeStateReconnectTimer = null
let runtimeStateStreamStopped = false
let pendingRuntimeState = null
let runtimeStatePublishTimer = null

function defaultRuntimeStateStreamUrl(baseUrl) {
  try {
    const url = new URL('/ws/runtime', baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.toString()
  } catch (_error) {
    return 'ws://127.0.0.1:8080/ws/runtime'
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

  debugWindow = new BrowserWindow({
    width: 1520,
    height: 1640,
    minWidth: 560,
    minHeight: 640,
    title: 'LED Debug Panel',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

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

  tcpServer = net.createServer((socket) => {
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
  const WebSocketClient = typeof globalThis.WebSocket === 'function' ? globalThis.WebSocket : NodeWebSocket
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

app.whenReady().then(() => {
  startFrameServer()
  startRuntimeStateStream()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

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
})
