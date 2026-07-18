const ACTIVE_GAME_STATES = new Set(['IDLE', 'PREPARING', 'STARTING', 'RUNNING', 'SETTLING'])
const PREPARATION_PATCH_FIELDS = new Set([
  'icList',
  'userCount',
  'startLevelIndex',
  'tokenList',
  'isAdmin',
  'launchMethod',
  'stageFailurePolicy',
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
    return jsonRequest('/game/preparations', 'POST', { launchMethod: 'touch' })
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
  return kind === 'debug' || kind === 'touch' ? kind : 'main'
}

module.exports = {
  detectWindowKind,
  hasTermination,
  isActiveGameFlow,
  preparationPath,
  preparationRequest,
  sanitizePreparationPatch,
  shouldInitializeSystemIdle,
}
