const ACTIVE_GAME_STATES = new Set(['IDLE', 'PREPARING', 'STARTING', 'RUNNING', 'SETTLING'])
const PREPARATION_PATCH_FIELDS = new Set([
  'icList',
  'userCount',
  'startLevelIndex',
  'tokenList',
  'isAdmin',
  'launchMethod',
  'stageFailurePolicy',
  'runtimeMode',
])

function shouldInitializeSystemIdle(state) {
  if (!state || String(state.engineState || '').toUpperCase() !== 'STOPPED') {
    return false
  }
  return !hasTermination(state) && !state.preparation && state.gameId == null
}

function hasTermination(state) {
  return Boolean(state && (state.terminationReason != null || typeof state.success === 'boolean'))
}

function isActiveGameFlow(state) {
  return ACTIVE_GAME_STATES.has(String(state?.engineState || '').toUpperCase())
}

function preparationPath(sessionId, suffix = '') {
  const id = String(sessionId || '').trim()
  if (!id) {
    throw new Error('Preparation session id is required')
  }
  return `/game/preparations/${encodeURIComponent(id)}${suffix}`
}

function sanitizePreparationPatch(value) {
  const source = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(
    Object.entries(source).filter(([key, item]) => PREPARATION_PATCH_FIELDS.has(key) && item !== undefined),
  )
}

function preparationRequest(kind, sessionId, payload) {
  if (kind === 'create') {
    const source = payload && typeof payload === 'object'
      ? payload
      : { launchMethod: payload }
    const requestBody = {
      launchMethod: normalizeLaunchMethod(source.launchMethod),
      ...(Array.isArray(source.tokenList) && source.tokenList.length
        ? { tokenList: source.tokenList.map((item) => String(item)) }
        : {}),
    }
    if (source && typeof source === 'object' && source.runtimeMode !== undefined) {
      requestBody.runtimeMode = normalizeRuntimeMode(source.runtimeMode)
    }
    return jsonRequest('/game/preparations', 'POST', requestBody)
  }
  if (kind === 'select') {
    return jsonRequest(preparationPath(sessionId, '/game'), 'PUT', { gameId: payload })
  }
  if (kind === 'update') {
    return jsonRequest(preparationPath(sessionId), 'PATCH', sanitizePreparationPatch(payload))
  }
  if (kind === 'confirm') {
    return { pathname: preparationPath(sessionId, '/confirm'), options: { method: 'POST' } }
  }
  if (kind === 'cancel') {
    return { pathname: preparationPath(sessionId), options: { method: 'DELETE' } }
  }
  throw new Error(`Unsupported preparation request: ${kind}`)
}

function normalizeLaunchMethod(value) {
  return value === 'coin' || value === 'wristband' ? value : 'touch'
}

function normalizeRuntimeMode(value) {
  return String(value || '').toUpperCase() === 'SIMULATION' ? 'SIMULATION' : 'PRODUCTION'
}

function appendPreparationWristband(state, value) {
  const uid = String(value || '').trim()
  if (!/^\d{1,32}$/.test(uid)) throw new Error('WRISTBAND_ID_INVALID')
  const source = state && typeof state === 'object' ? state : {}
  const participants = Array.isArray(source.playerAccesses)
    ? source.playerAccesses
    : source.playerAccess
      ? [source.playerAccess]
      : []
  const accepted = participants
    .map((participant) => String(participant?.access?.uid || '').trim())
    .filter((item) => /^\d{1,32}$/.test(item))
  if (accepted.includes(uid)) throw new Error('DUPLICATE_WRISTBAND')
  const selected = Number(source.preparation?.options?.userCount)
  const required = Number.isInteger(selected) && selected > 0 ? selected : 1
  if (accepted.length >= required) throw new Error('WRISTBAND_PARTICIPANT_LIMIT')
  return [...accepted, uid]
}

function queueRequest(kind, itemId, payload) {
  if (kind === 'enqueue') {
    return jsonRequest('/engine/game/queue', 'POST', payload)
  }
  if (kind === 'cancel') {
    const id = String(itemId || '').trim()
    if (!id) throw new Error('Queue item id is required')
    return { pathname: `/engine/game/queue/${encodeURIComponent(id)}`, options: { method: 'DELETE' } }
  }
  if (kind === 'list') return { pathname: '/engine/game/queue', options: { method: 'GET' } }
  throw new Error(`Unsupported queue request: ${kind}`)
}

function gameFlowWindowPlan(mode) {
  const presentationMode = mode === 'game' ? 'game' : 'debug'
  return {
    presentationMode,
    openDebugPanel: presentationMode === 'debug',
    fullScreenTouch: presentationMode === 'game',
  }
}

function debugGameSplitBounds(workArea) {
  const source = workArea && typeof workArea === 'object' ? workArea : {}
  const x = Number.isFinite(Number(source.x)) ? Math.trunc(Number(source.x)) : 0
  const y = Number.isFinite(Number(source.y)) ? Math.trunc(Number(source.y)) : 0
  const width = Math.max(0, Math.trunc(Number(source.width) || 0))
  const height = Math.max(0, Math.trunc(Number(source.height) || 0))
  const touchWidth = Math.floor(width / 2)

  return {
    touch: { x, y, width: touchWidth, height },
    debug: { x: x + touchWidth, y, width: width - touchWidth, height },
  }
}

function isTouchExitCode(value) {
  return String(value ?? '') === '888888'
}

function jsonRequest(pathname, method, body) {
  return {
    pathname,
    options: {
      method,
      body: JSON.stringify(body),
    },
  }
}

function detectWindowKind(search) {
  const kind = new URLSearchParams(search || '').get('window')
  return kind === 'debug' || kind === 'touch' || kind === 'secondary' ? kind : 'main'
}

module.exports = {
  appendPreparationWristband,
  detectWindowKind,
  debugGameSplitBounds,
  gameFlowWindowPlan,
  hasTermination,
  isActiveGameFlow,
  isTouchExitCode,
  normalizeLaunchMethod,
  normalizeRuntimeMode,
  queueRequest,
  preparationPath,
  preparationRequest,
  sanitizePreparationPatch,
  shouldInitializeSystemIdle,
}
