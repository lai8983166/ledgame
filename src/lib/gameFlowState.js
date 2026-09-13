import { normalizePlayerAccess } from "./playerAccess.js";

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
  const queueSummary = normalizeQueueSummary(state.queueSummary);
  const legacyPlayerAccess = normalizePlayerAccess(state.playerAccess);
  const playerAccesses = Array.isArray(state.playerAccesses)
    ? state.playerAccesses.map(normalizePlayerAccess).filter(Boolean)
    : legacyPlayerAccess
      ? [legacyPlayerAccess]
      : [];
  return {
    ...state,
    engineState,
    gameId: nullableNumber(state.gameId ?? preparation?.gameId),
    gameType: nullableText(state.gameType ?? preparation?.gameType),
    gameName: nullableText(state.gameName ?? preparation?.gameName),
    running: engineState === "RUNNING",
    success: typeof state.success === "boolean" ? state.success : null,
    terminationReason: nullableText(state.terminationReason),
    currentStageIndex: nullableNonNegativeInteger(state.currentStageIndex),
    stageOutcome: normalizeStageOutcome(state.stageOutcome),
    stageFailurePolicy: nullableText(
      state.stageFailurePolicy ?? preparation?.options.stageFailurePolicy,
    ),
    userCount: nullableNumber(state.userCount ?? preparation?.options.userCount),
    startLevelIndex: nonNegativeInteger(
      state.startLevelIndex ?? preparation?.options.startLevelIndex,
      0,
    ),
    preparation,
    runtimeMode: normalizeRuntimeMode(state.runtimeMode ?? preparation?.options.runtimeMode),
    queueSummary,
    playerAccesses,
    playerAccess: playerAccesses[0] ?? null,
    gameTime: normalizeGameTime(state.gameTime),
    childMode: Boolean(state.childMode),
    gameplay: state.gameplay && typeof state.gameplay === "object" ? { ...state.gameplay } : null,
  };
}

export function normalizeGameTime(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const mode = String(value.mode || "").trim().toUpperCase();
  if (mode === "UNLIMITED") {
    return { mode, remainingMillis: null, running: Boolean(value.running) };
  }
  if (mode !== "LIMITED") {
    return null;
  }
  const remainingMillis = nullableNumber(value.remainingMillis);
  if (remainingMillis === null) {
    return null;
  }
  return {
    mode,
    remainingMillis: Math.max(0, remainingMillis),
    running: Boolean(value.running),
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
      runtimeMode: normalizeRuntimeMode(options.runtimeMode),
    },
  };
}

// WebSocket lifecycle events can arrive after the command response that
// updated preparation. Never let an older snapshot remove a freshly scanned
// wristband from the preparation screen.
export function shouldIgnoreStalePreparationState(currentValue, nextValue) {
  const current = normalizeRuntimeState(currentValue);
  const next = normalizeRuntimeState(nextValue);
  if (
    current.engineState !== "PREPARING" ||
    next.engineState !== "PREPARING" ||
    !current.preparation ||
    !next.preparation ||
    current.preparation.sessionId !== next.preparation.sessionId
  ) {
    return false;
  }
  if (next.preparation.revision < current.preparation.revision) {
    return true;
  }
  return Boolean(
    next.preparation.revision <= current.preparation.revision &&
      next.playerAccesses.length < current.playerAccesses.length,
  );
}

export function normalizeQueueSummary(value) {
  const source = value && typeof value === "object" ? value : {};
  const normalizeItem = (item) => (item && typeof item === "object" ? {
    id: String(item.id || ""),
    wristbandUid: item.wristbandUid ? String(item.wristbandUid) : null,
    gameId: nullableNumber(item.gameId),
    gameName: nullableText(item.gameName),
    status: nullableText(item.status),
    reason: nullableText(item.reason),
  } : null);
  return {
    deviceId: nullableText(source.deviceId),
    current: normalizeItem(source.current),
    waiting: Array.isArray(source.waiting) ? source.waiting.map(normalizeItem).filter(Boolean) : [],
    failed: Array.isArray(source.failed) ? source.failed.map(normalizeItem).filter(Boolean) : [],
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
    displayName: nullableText(value.displayName) || nullableText(value.name) || `Game ${id}`,
    childModeVisible: value.childModeVisible !== false,
    type: nullableText(value.type),
    mode: nullableText(value.mode),
    cover: nullableText(value.cover),
    description: nullableText(value.description),
    firstCatalog: nullableText(value.firstCatalog),
    displayOrder: nullableNumber(value.displayOrder),
    participants: nullableNumber(value.participants ?? value.maxPlayers),
    minPlayers: nullableNumber(value.minPlayers) ?? 1,
    maxPlayers: nullableNumber(value.maxPlayers ?? value.participants) ?? 1,
    width: nullableNumber(value.width),
    height: nullableNumber(value.height),
    levels: Array.isArray(value.levels) ? value.levels.map((level, index) => ({
      index: nonNegativeInteger(level?.index, index),
      label: nullableText(level?.label) || `Level ${index + 1}`,
      durationSeconds: nullableNumber(level?.durationSeconds),
    })) : [],
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

export function extractErrorMessage(error, fallback = "Operation failed") {
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

function nullableNonNegativeInteger(value) {
  return value === null || value === undefined || value === ""
    ? null
    : nonNegativeInteger(value, null);
}

function normalizeStageOutcome(value) {
  const outcome = String(value || "").trim().toUpperCase();
  return ["SUCCESS", "RETRY", "FAILURE"].includes(outcome) ? outcome : null;
}

function normalizeRuntimeMode(value) {
  return String(value || "").toUpperCase() === "SIMULATION" ? "SIMULATION" : "PRODUCTION";
}
