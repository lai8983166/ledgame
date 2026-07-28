function unwrapResult(result) {
  return result?.data ?? result;
}

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
