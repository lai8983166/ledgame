const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ledGame', {
  windowKind: new URLSearchParams(window.location.search).get('window') === 'debug' ? 'debug' : 'main',
  openDebugPanel: () => ipcRenderer.invoke('open-debug-panel'),
  startFixed: () => ipcRenderer.invoke('engine:start-fixed'),
  startInput: () => ipcRenderer.invoke('engine:start-input'),
  startGame: (request) => ipcRenderer.invoke('engine:start-game', request),
  stopGame: () => ipcRenderer.invoke('engine:stop-game'),
  gameState: () => ipcRenderer.invoke('engine:game-state'),
  sendGameInput: (input) => ipcRenderer.invoke('engine:game-input', input),
  stop: () => ipcRenderer.invoke('engine:stop'),
  state: () => ipcRenderer.invoke('engine:state'),
  sendInput: (input) => ipcRenderer.invoke('engine:input', input),
  seedSimpleDemo: () => ipcRenderer.invoke('dev:seed-simple-demo'),
  getGameEditor: (gameId) => ipcRenderer.invoke('game-editor:get', gameId),
  validateGameEditor: (document) => ipcRenderer.invoke('game-editor:validate', document),
  saveGameEditor: (gameId, document) => ipcRenderer.invoke('game-editor:save', gameId, document),
  latestFrame: () => ipcRenderer.invoke('frame:latest'),
  onLedFrame: (callback) => {
    const listener = (_event, frame) => callback(frame)
    ipcRenderer.on('led-frame', listener)
    return () => ipcRenderer.removeListener('led-frame', listener)
  },
  onEngineState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('engine-state', listener)
    return () => ipcRenderer.removeListener('engine-state', listener)
  },
})
