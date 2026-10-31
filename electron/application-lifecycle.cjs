function createBackendReadiness(onChanged = () => {}) {
  let state = { status: 'starting', message: '' }
  let resolveReady, rejectReady
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  ready.catch(() => {})
  return {
    get: () => ({ ...state }),
    wait: () => ready,
    complete() {
      if (state.status !== 'starting') return
      state = { status: 'ready', message: '' }
      resolveReady()
      onChanged({ ...state })
    },
    fail(error) {
      if (state.status !== 'starting') return
      const message = error?.message || String(error)
      state = { status: 'failed', message }
      rejectReady(new Error(message))
      onChanged({ ...state })
    },
  }
}

function createCloseApproval({ send, isAvailable }) {
  let pending = null
  let serial = 0
  return {
    request() {
      if (!isAvailable()) return Promise.resolve(true)
      if (pending) return pending.promise
      const requestId = ++serial
      let resolve
      const promise = new Promise((done) => { resolve = done })
      pending = { requestId, resolve, promise }
      send({ requestId })
      return promise
    },
    respond(requestId, allowed) {
      if (!pending || requestId !== pending.requestId) return false
      const request = pending
      pending = null
      request.resolve(allowed === true)
      return true
    },
    cancel() {
      if (pending) this.respond(pending.requestId, false)
    },
  }
}

async function finishTouchSession({ state, cancelPreparation, stopGame }) {
  const engineState = String(state?.engineState || '').toUpperCase()
  if (engineState === 'PREPARING' && state?.preparation?.sessionId) {
    await cancelPreparation(state.preparation.sessionId)
  } else if (state?.running === true || ['PREPARING', 'STARTING', 'RUNNING', 'SETTLING'].includes(engineState)) {
    await stopGame()
  }
}

module.exports = { createBackendReadiness, createCloseApproval, finishTouchSession }
