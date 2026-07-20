const { contextBridge, ipcRenderer } = require('electron')

function detectWindowKind(search) {
  const kind = new URLSearchParams(search || '').get('window')
  return kind === 'debug' || kind === 'touch' ? kind : 'main'
}

contextBridge.exposeInMainWorld('ledGame', {
  windowKind: detectWindowKind(window.location.search),
  enterGameFlow: () => ipcRenderer.invoke('game-flow:enter'),
  openDebugPanel: () => ipcRenderer.invoke('open-debug-panel'),
  startFixed: () => ipcRenderer.invoke('engine:start-fixed'),
  startInput: () => ipcRenderer.invoke('engine:start-input'),
  startGame: (request) => ipcRenderer.invoke('engine:start-game', request),
  stopGame: () => ipcRenderer.invoke('engine:stop-game'),
  gameState: () => ipcRenderer.invoke('engine:game-state'),
  listGames: () => ipcRenderer.invoke('game:list'),
  touchGameState: () => ipcRenderer.invoke('game:state'),
  startSystemIdle: () => ipcRenderer.invoke('game:idle'),
  stopTouchGame: () => ipcRenderer.invoke('game:stop'),
  createPreparation: () => ipcRenderer.invoke('game:preparation:create'),
  selectPreparationGame: (sessionId, gameId) =>
    ipcRenderer.invoke('game:preparation:select', sessionId, gameId),
  updatePreparation: (sessionId, patch) =>
    ipcRenderer.invoke('game:preparation:update', sessionId, patch),
  confirmPreparation: (sessionId) =>
    ipcRenderer.invoke('game:preparation:confirm', sessionId),
  cancelPreparation: (sessionId) =>
    ipcRenderer.invoke('game:preparation:cancel', sessionId),
  sendGameInput: (input) => ipcRenderer.invoke('engine:game-input', input),
  stop: () => ipcRenderer.invoke('engine:stop'),
  state: () => ipcRenderer.invoke('engine:state'),
  sendInput: (input) => ipcRenderer.invoke('engine:input', input),
  seedSimpleDemo: () => ipcRenderer.invoke('dev:seed-simple-demo'),
  getGameEditor: (gameId) => ipcRenderer.invoke('game-editor:get', gameId),
  validateGameEditor: (document) => ipcRenderer.invoke('game-editor:validate', document),
  saveGameEditor: (gameId, document) => ipcRenderer.invoke('game-editor:save', gameId, document),
  exportFrameJson: (payload) => ipcRenderer.invoke('frame:export-json', payload),
  importFrameJson: () => ipcRenderer.invoke('frame:import-json'),
  saveGif: (payload) => ipcRenderer.invoke('level:save-gif', payload),
  reportEditorLayout: (snapshot) => ipcRenderer.send('diagnostic:editor-layout', snapshot),
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

contextBridge.exposeInMainWorld('mediaLibrary', {
  list: () => ipcRenderer.invoke('media:list'),
  getPreviewUrl: (relativePath) => ipcRenderer.invoke('media:get-preview-url', relativePath),
})

contextBridge.exposeInMainWorld('appLanguage', {
  get: () => ipcRenderer.invoke('app-language:get'),
  set: (locale) => ipcRenderer.invoke('app-language:set', locale),
  onChanged: (callback) => {
    const listener = (_event, locale) => callback(locale)
    ipcRenderer.on('app-language-changed', listener)
    return () => ipcRenderer.removeListener('app-language-changed', listener)
  },
})

contextBridge.exposeInMainWorld('spiritLibrary', {
  list: () => ipcRenderer.invoke('spirit:list'),
  create: (payload) => ipcRenderer.invoke('spirit:create', payload),
  update: (spiritId, payload) => ipcRenderer.invoke('spirit:update', spiritId, payload),
})

contextBridge.exposeInMainWorld('elc408Tools', {
  networkInterfaces: () => ipcRenderer.invoke('elc408:network-interfaces'),
  generateConfig: (draft) => ipcRenderer.invoke('elc408:generate-config', draft),
  generateWiring: (document) => ipcRenderer.invoke('elc408:generate-wiring', document),
  reload: () => ipcRenderer.invoke('elc408:reload'),
  debugState: () => ipcRenderer.invoke('elc408:debug-state'),
  search: (request) => ipcRenderer.invoke('elc408:debug-search', request),
  start: (request) => ipcRenderer.invoke('elc408:debug-start', request),
  stop: () => ipcRenderer.invoke('elc408:debug-stop'),
  logs: (after, limit) => ipcRenderer.invoke('elc408:debug-logs', after, limit),
  clearLogs: () => ipcRenderer.invoke('elc408:debug-clear-logs'),
  saveGeneratedFile: (payload) => ipcRenderer.invoke('elc408:save-generated-file', payload),
})
