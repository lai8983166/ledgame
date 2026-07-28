export function createLatestAsyncTaskGuard() {
  let version = 0;

  return {
    begin(key = null) {
      return Object.freeze({ version: ++version, key });
    },
    invalidate() {
      version += 1;
    },
    isCurrent(ticket, key = ticket?.key) {
      return Boolean(ticket) && ticket.version === version && ticket.key === key;
    },
  };
}

export function createLatestAsyncValueLoader({
  loadValue,
  isActive,
  getCurrentKey,
  onSuccess,
  onError,
}) {
  const guard = createLatestAsyncTaskGuard();

  return {
    invalidate() {
      guard.invalidate();
    },

    async load(key, context) {
      const ticket = guard.begin(key);
      try {
        const value = await loadValue(key, context);
        if (!isActive() || !guard.isCurrent(ticket, getCurrentKey())) {
          return false;
        }
        onSuccess(value, key, context);
        return true;
      } catch (error) {
        if (!isActive() || !guard.isCurrent(ticket, getCurrentKey())) {
          return false;
        }
        onError(error, key, context);
        return true;
      }
    },
  };
}
