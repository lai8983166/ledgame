const path = require('node:path')
const net = require('node:net')
const { app, BrowserWindow, ipcMain } = require('electron')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const backendBaseUrl = process.env.LED_BACKEND_URL || 'http://127.0.0.1:8080'
const framePort = Number(process.env.LED_DEBUG_TCP_PORT || 3002)

let mainWindow
let debugWindow
let latestFrame = null
let tcpServer = null

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
    width: 760,
    height: 820,
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
  latestFrame = {
    width: 16,
    height: 16,
    rgb,
    receivedAt: Date.now(),
  }

  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.webContents.send('led-frame', latestFrame)
  }
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

ipcMain.handle('open-debug-panel', () => {
  createDebugWindow()
})

ipcMain.handle('frame:latest', () => latestFrame)
ipcMain.handle('engine:start-fixed', () => engineStateRequest('/engine/demo/fixed/start', { method: 'POST' }))
ipcMain.handle('engine:start-input', () => engineStateRequest('/engine/demo/input/start', { method: 'POST' }))
ipcMain.handle('engine:stop', () => engineStateRequest('/engine/demo/stop', { method: 'POST' }))
ipcMain.handle('engine:state', () => engineStateRequest('/engine/demo/state'))
ipcMain.handle('engine:input', (_event, input) =>
  backendRequest('/engine/demo/input', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
)

app.whenReady().then(() => {
  startFrameServer()
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
  if (tcpServer) {
    tcpServer.close()
  }
})
