const PREFIX = "[ELC408]";
const MAX_ERROR_MESSAGE_LENGTH = 240;

function boundedText(value, maxLength = MAX_ERROR_MESSAGE_LENGTH) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function summarizeDebugState(payload) {
  const state = payload?.data ?? payload;
  const controllers = Array.isArray(state?.controllers) ? state.controllers : [];
  return {
    owner: String(state?.owner ?? ""),
    running: Boolean(state?.debugRunning),
    controllerModel: String(state?.controllerModel ?? ""),
    channelsPerController: Number.isFinite(state?.channelsPerController)
      ? state.channelsPerController
      : 0,
    controllerCount: controllers.length,
  };
}

export function summarizeElc408Error(error) {
  const message = typeof error?.message === "string"
    ? error.message
    : String(error ?? "");
  const codeMatch = message.match(/^([A-Z][A-Z0-9_]+):/);
  return {
    code: codeMatch ? codeMatch[1] : "",
    message: boundedText(message),
  };
}

export function createElc408Diagnostics(consoleTarget = globalThis.console) {
  let lastStateSnapshot = "";

  function info(message, summary) {
    if (typeof consoleTarget?.debug === "function") {
      consoleTarget.debug(`${PREFIX} ${message}`, summary);
    }
  }

  return {
    started(operation, summary = {}) {
      info(`${operation} started`, summary);
    },
    succeeded(operation, state) {
      info(`${operation} succeeded`, summarizeDebugState(state));
    },
    failed(operation, error) {
      info(`${operation} failed`, summarizeElc408Error(error));
    },
    stateChanged(state) {
      const summary = summarizeDebugState(state);
      const snapshot = JSON.stringify(summary);
      if (snapshot === lastStateSnapshot) {
        return false;
      }
      lastStateSnapshot = snapshot;
      info("authoritative state changed", summary);
      return true;
    },
  };
}
