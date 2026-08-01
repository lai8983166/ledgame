function unwrapResult(result) {
  return result?.data ?? result;
}

const ACTIVE_GAME_STATES = new Set(["STARTING", "RUNNING", "SETTLING"]);

export function createTouchStateCoordinator({ readState, applyState }) {
  let broadcastVersion = 0;

  return {
    applyBroadcast(state) {
      broadcastVersion += 1;
      applyState(state);
    },

    async refresh() {
      const versionBeforeRequest = broadcastVersion;
      const result = await readState();
      const applied = broadcastVersion === versionBeforeRequest;
      if (applied) {
        applyState(unwrapResult(result));
      }
      return { applied, result };
    },
  };
}

export async function confirmTouchPreparationTransaction({
  api,
  sessionId,
  patch,
  applyState,
  recover,
}) {
  try {
    const updated = await api.updatePreparation(sessionId, patch);
    applyState(unwrapResult(updated));
    const confirmed = await api.confirmPreparation(sessionId);
    applyState(unwrapResult(confirmed));
    return confirmed;
  } catch (error) {
    await recover?.(error);
    throw error;
  }
}

export async function returnTouchRuntimeToIdle({
  api,
  engineState,
  preparationSessionId,
  applyState,
}) {
  const state = String(engineState || "").trim().toUpperCase();
  if (state === "PREPARING" && preparationSessionId) {
    const cancelled = await api.cancelPreparation(preparationSessionId);
    applyState(unwrapResult(cancelled));
  } else if (ACTIVE_GAME_STATES.has(state)) {
    const stopped = await api.stopTouchGame();
    applyState(unwrapResult(stopped));
  }

  const idled = await api.startSystemIdle();
  applyState(unwrapResult(idled));
  return idled;
}
