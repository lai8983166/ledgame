export const GAME_LIFECYCLE_STATES = Object.freeze([
  "IDLE",
  "PREPARING",
  "STARTING",
  "RUNNING",
  "SETTLING",
  "STOPPED",
]);

const LIFECYCLE_SET = new Set(GAME_LIFECYCLE_STATES);

export function unwrapBackendData(value) {
  if (value && typeof value === "object" && "data" in value && !("engineState" in value)) {
    return value.data;
  }
  return value;
}

export function normalizeRuntimeState(value) {
  const source = unwrapBackendData(value);
  const state = source && typeof source === "object" ? source : {};
  const engineState = normalizeLifecycleState(state.engineState);
  const preparation = normalizePreparation(state.preparation);
  return {
    ...state,
    engineState,
    gameId: nullableNumber(state.gameId ?? preparation?.gameId),
    gameType: nullableText(state.gameType ?? preparation?.gameType),
    gameName: nullableText(state.gameName ?? preparation?.gameName),
    running: engineState === "RUNNING",
    success: typeof state.success === "boolean" ? state.success : null,
    terminationReason: nullableText(state.terminationReason),
    stageFailurePolicy: nullableText(
      state.stageFailurePolicy ?? preparation?.options.stageFailurePolicy,
    ),
    userCount: nullableNumber(state.userCount ?? preparation?.options.userCount),
    startLevelIndex: nonNegativeInteger(
      state.startLevelIndex ?? preparation?.options.startLevelIndex,
      0,
    ),
    preparation,
    gameplay: state.gameplay && typeof state.gameplay === "object" ? { ...state.gameplay } : null,
  };
}

export function normalizePreparation(value) {
  if (!value || typeof value !== "object" || !String(value.sessionId || "").trim()) {
    return null;
  }
  const options = value.options && typeof value.options === "object" ? value.options : {};
  return {
    sessionId: String(value.sessionId),
    revision: nonNegativeInteger(value.revision, 0),
    gameId: nullableNumber(value.gameId),
    gameType: nullableText(value.gameType),
    gameName: nullableText(value.gameName),
    options: {
      userCount: nullableNumber(options.userCount),
      startLevelIndex: nonNegativeInteger(options.startLevelIndex, 0),
      stageFailurePolicy: normalizeFailurePolicy(options.stageFailurePolicy),
      launchMethod: nullableText(options.launchMethod) || "touch",
      icList: Array.isArray(options.icList) ? [...options.icList] : [],
      tokenList: Array.isArray(options.tokenList) ? [...options.tokenList] : [],
      isAdmin: Boolean(options.isAdmin),
    },
  };
}

export function normalizeGameSummary(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = nullableNumber(value.id ?? value.gameId);
  if (id === null) {
    return null;
  }
  return {
    id,
    name: nullableText(value.name) || `Game ${id}`,
    type: nullableText(value.type),
    mode: nullableText(value.mode),
    cover: nullableText(value.cover),
    participants: nullableNumber(value.participants),
  };
}

export function normalizeGameList(value) {
  const source = unwrapBackendData(value);
  if (!Array.isArray(source)) {
    return [];
  }
  return source.map(normalizeGameSummary).filter(Boolean);
}

export function touchViewForState(value) {
  const state = normalizeRuntimeState(value);
  return LIFECYCLE_SET.has(state.engineState) ? state.engineState : "LOADING";
}

export function hasTermination(value) {
  const state = normalizeRuntimeState(value);
  return state.terminationReason !== null || state.success !== null;
}

export function extractErrorMessage(error, fallback = "操作失败") {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  const message = error?.response?.message ?? error?.data?.message ?? error?.message;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

function normalizeLifecycleState(value) {
  const normalized = String(value || "UNKNOWN").trim().toUpperCase();
  return LIFECYCLE_SET.has(normalized) ? normalized : "UNKNOWN";
}

function normalizeFailurePolicy(value) {
  return String(value || "END_GAME").toUpperCase() === "RETRY" ? "RETRY" : "END_GAME";
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function nullableText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}
