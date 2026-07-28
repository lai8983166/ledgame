export async function clearLogsWithPollingIsolation({
  stopPolling,
  clearRemote,
  applyClearedState,
  handleError,
  resumePolling,
}) {
  stopPolling();
  try {
    const result = await clearRemote();
    const next = result?.data ?? result;
    const nextCursor = Number.isFinite(next) ? next : 0;
    applyClearedState(nextCursor);
    return { cleared: true, nextCursor, result };
  } catch (error) {
    handleError(error);
    return { cleared: false, error };
  } finally {
    resumePolling();
  }
}
