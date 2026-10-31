const { contextBridge, ipcRenderer } = require('electron')

function userErrorMessage(error) {
  let message = String(error?.message || error || '').trim()
  // Electron adds the IPC channel to errors crossing the process boundary.
  message = message.replace(/^(?:Error:\s*)?Error invoking remote method ['"][^'"]+['"]:\s*/i, '')
    .replace(/^(?:Error|TypeError|java\.[\w.]+Exception):\s*/i, '').split(/\r?\n/)[0].trim()
  const translations = [
    [/^Touch exit password must contain 4 to 12 digits$/i, '退出密码需为4～12位数字'],
    [/^Coin count must be an integer between 1 and 999$/i, '投币数量需为1～999的整数'],
    [/^Application title must contain 1 to 64 characters$/i, '应用标题需为1～64个字符'],
    [/^Member platform host is invalid$/i, '会员管理端地址无效'],
    [/^Member platform port must be between 1 and 65535$/i, '会员管理端端口需为1～65535'],
    [/^(?:.*category.*(?:already exists|duplicate)|(?:duplicate|already exists).*category.*)$/i, '分类名称已存在'],
    [/^EEXIST:.*$/i, '同名文件或文件夹已存在'],
    [/^ENOENT:.*$/i, '文件或文件夹不存在'],
    [/^(?:EACCES|EPERM):.*$/i, '无法访问文件或文件夹，请检查权限'],
    [/^(?:fetch failed|Failed to fetch|ECONNREFUSED.*)$/i, '无法连接游戏服务，请稍后重试'],
    [/^SECONDARY_DISPLAY_UNAVAILABLE$/i, '当前没有可用的显示器'],
    [/^Secondary idle (?:subtitle|prompt text) must contain (.*) characters$/i, '副屏标题长度无效'],
    [/^Secondary idle (?:text size|font size).*$/i, '副屏字号无效'],
    [/^(?:Secondary|Touch) idle prompt font size must be an integer between \d+ and \d+$/i, '文字字号需为支持范围内的整数'],
    [/^Backend request failed: \d+$/i, '操作失败，请稍后重试'],
  ]
  for (const [pattern, translated] of translations) if (pattern.test(message)) return translated
  // Keep the concrete backend reason while removing its internal error-code prefix.
  if (/[\u3400-\u9fff]/.test(message) && !/^(?:ELC408_|WRISTBAND_|PLAYER_|MEMBER_)/.test(message)) {
    message = message.replace(/^[A-Z][A-Z0-9_]+:\s*/, '')
  }
  return message || '操作失败，请重试'
}

function exposeApi(name, api) {
  const wrapped = Object.fromEntries(Object.entries(api).map(([key, value]) => [key,
    typeof value !== 'function' ? value : (...args) => {
      try {
        const result = value(...args)
        return result && typeof result.then === 'function'
          ? result.catch((error) => { throw new Error(userErrorMessage(error)) })
          : result
      } catch (error) {
        throw new Error(userErrorMessage(error))
      }
    },
  ]))
  contextBridge.exposeInMainWorld(name, wrapped)
}

function detectWindowKind(search) {
  const kind = new URLSearchParams(search || '').get('window')
  return kind === 'debug' || kind === 'touch' || kind === 'secondary' ? kind : 'main'
}

const windowKind = detectWindowKind(window.location.search)
const customTitleBarEnabled = windowKind === 'main' && process.platform === 'win32'

function isEditableElement(target) {
  return Boolean(
    target &&
      typeof target.closest === 'function' &&
      target.closest('input, textarea, select, [contenteditable="true"]'),
  )
}

function reportEditableFocus(target) {
  if (windowKind === 'touch') {
    ipcRenderer.send('game:editable-focus', isEditableElement(target))
  }
}

if (windowKind === 'touch') {
  window.addEventListener('focusin', (event) => reportEditableFocus(event.target))
  window.addEventListener('focusout', () => {
    setTimeout(() => reportEditableFocus(document.activeElement), 0)
  })
  window.addEventListener('focus', () => {
    setTimeout(() => reportEditableFocus(document.activeElement), 0)
  })
}

function onEngineState(callback) {
  const listener = (_event, state) => callback(state)
  ipcRenderer.on('engine-state', listener)
  return () => ipcRenderer.removeListener('engine-state', listener)
}

const secondaryRuntimeApi = {
  windowKind,
  touchGameState: () => ipcRenderer.invoke('game:state'),
  onEngineState,
}

const fullLedGameApi = {
  windowKind,
  customTitleBarEnabled,
  backendStatus: () => ipcRenderer.invoke('backend:status'),
  onBackendStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('backend-status-changed', listener)
    return () => ipcRenderer.removeListener('backend-status-changed', listener)
  },
  onCloseRequested: (callback) => {
    const listener = (_event, request) => callback(request)
    ipcRenderer.on('window:close-requested', listener)
    ipcRenderer.send('window:close-listening')
    return () => ipcRenderer.removeListener('window:close-requested', listener)
  },
  respondToClose: (requestId, allowed) => ipcRenderer.send('window:close-response', requestId, allowed === true),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  restoreFocus: () => ipcRenderer.invoke('window:restore-focus'),
  enterGameFlow: (options) => ipcRenderer.invoke('game-flow:enter', options),
  openDebugPanel: () => ipcRenderer.invoke('open-debug-panel'),
  startFixed: () => ipcRenderer.invoke('engine:start-fixed'),
  startInput: () => ipcRenderer.invoke('engine:start-input'),
  startGame: (request) => ipcRenderer.invoke('engine:start-game', request),
  stopGame: () => ipcRenderer.invoke('engine:stop-game'),
  gameState: () => ipcRenderer.invoke('engine:game-state'),
  listGames: () => ipcRenderer.invoke('game:list'),
  listPlayableGames: () => ipcRenderer.invoke('game:playable-list'),
  listManageableGames: () => ipcRenderer.invoke('game:manageable-list'),
  newGameDraft: (family) => ipcRenderer.invoke('game:new-draft', family),
  exportGame: (gameId) => ipcRenderer.invoke('game:export', gameId),
  importGame: (family) => ipcRenderer.invoke('game:import', family),
  deleteGame: (gameId) => ipcRenderer.invoke('game:delete', gameId),
  deleteGameCategory: (categoryId) => ipcRenderer.invoke('game-categories:delete', categoryId),
  listGameCategories: () => ipcRenderer.invoke('game-categories:list'),
  createGameCategory: (payload) => ipcRenderer.invoke('game-categories:create', payload),
  updateGameCategory: (categoryId, payload) => ipcRenderer.invoke('game-categories:update', categoryId, payload),
  reorderGameCategories: (categoryIds) => ipcRenderer.invoke('game-categories:reorder', categoryIds),
  touchGameState: () => ipcRenderer.invoke('game:state'),
  startSystemIdle: () => ipcRenderer.invoke('game:idle'),
  stopTouchGame: () => ipcRenderer.invoke('game:stop'),
  createPreparation: () => ipcRenderer.invoke('game:preparation:create'),
  createEditorPreparation: (payload) => ipcRenderer.invoke('editor-debug:prepare', payload),
  prepareEditorDebugHardware: () => ipcRenderer.invoke('editor-debug:hardware'),
  createWristbandPreparation: (sessionId, wristbandId) =>
    ipcRenderer.invoke('game:preparation:create-wristband', sessionId, wristbandId),
  selectPreparationGame: (sessionId, gameId) =>
    ipcRenderer.invoke('game:preparation:select', sessionId, gameId),
  updatePreparation: (sessionId, patch) =>
    ipcRenderer.invoke('game:preparation:update', sessionId, patch),
  confirmPreparation: (sessionId) =>
    ipcRenderer.invoke('game:preparation:confirm', sessionId),
  cancelPreparation: (sessionId) =>
    ipcRenderer.invoke('game:preparation:cancel', sessionId),
  enqueueGame: (payload) => ipcRenderer.invoke('game:queue:enqueue', payload),
  queueState: () => ipcRenderer.invoke('game:queue:list'),
  cancelQueuedGame: (itemId) => ipcRenderer.invoke('game:queue:cancel', itemId),
  sendDebugCommand: (command) => ipcRenderer.invoke('engine:debug-command', command),
  sendGameInput: (input) => ipcRenderer.invoke('engine:game-input', input),
  stop: () => ipcRenderer.invoke('engine:stop'),
  state: () => ipcRenderer.invoke('engine:state'),
  databaseRefreshAvailability: () => ipcRenderer.invoke('database:refresh-availability'),
  refreshDatabase: () => ipcRenderer.invoke('database:refresh'),
  sendInput: (input) => ipcRenderer.invoke('engine:input', input),
  seedSimpleDemo: () => ipcRenderer.invoke('dev:seed-simple-demo'),
  seedSimpleVariants: () => ipcRenderer.invoke('dev:seed-simple-variants'),
  seedRankType1: () => ipcRenderer.invoke('dev:seed-rank-type1'),
  getGameEditor: (gameId) => ipcRenderer.invoke('game-editor:get', gameId),
  validateGameEditor: (document) => ipcRenderer.invoke('game-editor:validate', document),
  saveGameEditor: (gameId, document) => ipcRenderer.invoke('game-editor:save', gameId, document),
  createGameEditor: (document) => ipcRenderer.invoke('game-editor:create', document),
  getRankGameEditor: (gameId) => ipcRenderer.invoke('rank-game-editor:get', gameId),
  validateRankGameEditor: (document) => ipcRenderer.invoke('rank-game-editor:validate', document),
  saveRankGameEditor: (gameId, document) => ipcRenderer.invoke('rank-game-editor:save', gameId, document),
  createRankGameEditor: (document) => ipcRenderer.invoke('rank-game-editor:create', document),
  updateGameMetadata: (gameId, patch) => ipcRenderer.invoke('game:metadata-update', gameId, patch),
  reorderGames: (gameIds) => ipcRenderer.invoke('game:reorder', gameIds),
  readHelpDocument: (key) => ipcRenderer.invoke('help:document', key),
  exportFrameJson: (payload) => ipcRenderer.invoke('frame:export-json', payload),
  importFrameJson: (payload) => ipcRenderer.invoke('frame:import-json', payload),
  saveGif: (payload) => ipcRenderer.invoke('level:save-gif', payload),
  touchPresentationMode: () => ipcRenderer.invoke('touch:presentation-mode'),
  exitTouchFullScreen: (code) => ipcRenderer.invoke('touch:exit-fullscreen', code),
  onTouchPresentationMode: (callback) => {
    const listener = (_event, mode) => callback(mode)
    ipcRenderer.on('touch-presentation-mode', listener)
    return () => ipcRenderer.removeListener('touch-presentation-mode', listener)
  },
  onWristbandScanned: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('wristband-scanned', listener)
    return () => ipcRenderer.removeListener('wristband-scanned', listener)
  },
  ...(process.env.LED_LAYOUT_DIAGNOSTICS === 'true'
    ? { reportEditorLayout: (snapshot) => ipcRenderer.send('diagnostic:editor-layout', snapshot) }
    : {}),
  latestFrame: () => ipcRenderer.invoke('frame:latest'),
  onLedFrame: (callback) => {
    const listener = (_event, frame) => callback(frame)
    ipcRenderer.on('led-frame', listener)
    return () => ipcRenderer.removeListener('led-frame', listener)
  },
  onEngineState,
  onDatabaseRefreshed: (callback) => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('database-refreshed', listener)
    return () => ipcRenderer.removeListener('database-refreshed', listener)
  },
  onCatalogChanged: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('game-catalog-changed', listener)
    return () => ipcRenderer.removeListener('game-catalog-changed', listener)
  },
}

exposeApi(
  'ledGame',
  windowKind === 'secondary' ? secondaryRuntimeApi : fullLedGameApi,
)

exposeApi('mediaLibrary', {
  list: () => ipcRenderer.invoke('media:list'),
  getPreviewUrl: (relativePath) => ipcRenderer.invoke('media:get-preview-url', relativePath),
  openFolder: () => ipcRenderer.invoke('media:open-folder'),
  upload: (folder) => ipcRenderer.invoke('media:upload', folder),
  createFolder: (folder, name) => ipcRenderer.invoke('media:create-folder', folder, name),
})

exposeApi('appLanguage', {
  get: () => ipcRenderer.invoke('app-language:get'),
  set: (locale) => ipcRenderer.invoke('app-language:set', locale),
  onChanged: (callback) => {
    const listener = (_event, locale) => callback(locale)
    ipcRenderer.on('app-language-changed', listener)
    return () => ipcRenderer.removeListener('app-language-changed', listener)
  },
})

exposeApi('appSettings', {
  get: () => ipcRenderer.invoke('app-settings:get'),
  getIconData: () => ipcRenderer.invoke('app-settings:icon-data'),
  getSecondaryBackground: () => ipcRenderer.invoke('secondary-display:background'),
  getSecondaryIdleMedia: () => ipcRenderer.invoke('secondary-display:idle-media'),
  testMemberPlatform: (settings) => ipcRenderer.invoke('app-settings:test-member-platform', settings),
  ...(windowKind === 'main'
    ? {
        update: (patch) => ipcRenderer.invoke('app-settings:update', patch),
        chooseIcon: () => ipcRenderer.invoke('app-settings:choose-icon'),
        chooseSecondaryBackground: () => ipcRenderer.invoke('app-settings:choose-secondary-background'),
        clearSecondaryBackground: () => ipcRenderer.invoke('app-settings:clear-secondary-background'),
        chooseSecondaryIdleMedia: () => ipcRenderer.invoke('app-settings:choose-secondary-idle-media'),
        clearSecondaryIdleMedia: () => ipcRenderer.invoke('app-settings:clear-secondary-idle-media'),
      }
    : {}),
  onChanged: (callback) => {
    const listener = (_event, settings) => callback(settings)
    ipcRenderer.on('app-settings-changed', listener)
    return () => ipcRenderer.removeListener('app-settings-changed', listener)
  },
})

if (windowKind === 'main') {
  exposeApi('secondaryDisplay', {
    list: () => ipcRenderer.invoke('secondary-display:list'),
    select: (displayId) => ipcRenderer.invoke('secondary-display:select', displayId),
    open: () => ipcRenderer.invoke('secondary-display:open'),
    onChanged: (callback) => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('secondary-display-changed', listener)
      return () => ipcRenderer.removeListener('secondary-display-changed', listener)
    },
  })
}

exposeApi('spiritLibrary', {
  list: () => ipcRenderer.invoke('spirit:list'),
  create: (payload) => ipcRenderer.invoke('spirit:create', payload),
  update: (spiritId, payload) => ipcRenderer.invoke('spirit:update', spiritId, payload),
  delete: (spiritId) => ipcRenderer.invoke('spirit:delete', spiritId),
})

exposeApi('elc408Tools', {
  networkInterfaces: () => ipcRenderer.invoke('elc408:network-interfaces'),
  readWiring: () => ipcRenderer.invoke('elc408:read-wiring'),
  generateConfig: (draft) => ipcRenderer.invoke('elc408:generate-config', draft),
  generateWiring: (document) => ipcRenderer.invoke('elc408:generate-wiring', document),
  reload: () => ipcRenderer.invoke('elc408:reload'),
  debugState: () => ipcRenderer.invoke('elc408:debug-state'),
  search: (request) => ipcRenderer.invoke('elc408:debug-search', request),
  start: (request) => ipcRenderer.invoke('elc408:debug-start', request),
  stop: () => ipcRenderer.invoke('elc408:debug-stop'),
  testPoint: (request) => ipcRenderer.invoke('elc408:debug-test-point', request),
  setLogCapture: (enabled) => ipcRenderer.invoke('elc408:debug-log-capture', enabled),
  logs: (after, limit) => ipcRenderer.invoke('elc408:debug-logs', after, limit),
  clearLogs: () => ipcRenderer.invoke('elc408:debug-clear-logs'),
  saveGeneratedFile: (payload) => ipcRenderer.invoke('elc408:save-generated-file', payload),
})
