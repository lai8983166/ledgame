import { normalizeRuntimeState } from "./gameFlowState.js";

export const SECONDARY_DISPLAY_MODES = Object.freeze({
  HUD: "HUD",
  SETTLING: "SETTLING",
  STAGE_SUCCESS: "STAGE_SUCCESS",
  STAGE_FAILURE: "STAGE_FAILURE",
  GAME_SUCCESS: "GAME_SUCCESS",
  GAME_FAILURE: "GAME_FAILURE",
});

export function createSecondaryDisplayPresentation(value, options = {}) {
  const state = normalizeRuntimeState(value);
  const gameplay = state.gameplay || {};
  const fallbackStageIndex = nullableNonNegativeInteger(gameplay.levelIndex);
  const stageIndex = state.currentStageIndex ?? fallbackStageIndex;
  const score = nullableFiniteNumber(gameplay.score);
  const life = nullableNonNegativeInteger(gameplay.life);
  const now = finiteNumber(options.now, Date.now());
  const observedAt = finiteNumber(options.observedAt, now);

  return {
    state,
    mode: displayMode(state),
    stageNumber: stageIndex === null ? null : stageIndex + 1,
    score,
    life,
    hearts: life === null ? null : "♥".repeat(life),
    retrying: state.engineState === "SETTLING" && state.stageOutcome === "RETRY",
    isRank: state.gameType === "rank",
    rankPlayers: Array.isArray(gameplay.players) ? gameplay.players : [],
    rankRemainingTimeText: nullableFiniteNumber(gameplay.remainingMillis) === null
      ? null
      : formatGameTime(gameplay.remainingMillis),
    gameTime: gameTimePresentation(state, now, observedAt),
  };
}

export function formatGameTime(value) {
  const milliseconds = Math.max(0, finiteNumber(value, 0));
  const totalSeconds = milliseconds > 0 ? Math.ceil(milliseconds / 1_000) : 0;
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const minuteText = String(hours > 0 ? minutes : totalMinutes).padStart(2, "0");
  const secondText = String(seconds).padStart(2, "0");
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${minuteText}:${secondText}`
    : `${minuteText}:${secondText}`;
}

function gameTimePresentation(state, now, observedAt) {
  const visible = ["STARTING", "RUNNING", "SETTLING"].includes(state.engineState);
  const gameTime = state.gameTime;
  if (!visible) {
    return { visible: false, mode: gameTime?.mode || "UNKNOWN", remainingMillis: null, text: null };
  }
  if (!gameTime) {
    return { visible: true, mode: "UNKNOWN", remainingMillis: null, text: "--" };
  }
  if (gameTime.mode === "UNLIMITED") {
    return { visible: true, mode: "UNLIMITED", remainingMillis: null, text: null };
  }
  const elapsed = gameTime.running ? Math.max(0, now - observedAt) : 0;
  const remainingMillis = Math.max(0, gameTime.remainingMillis - elapsed);
  return {
    visible: true,
    mode: "LIMITED",
    remainingMillis,
    text: formatGameTime(remainingMillis),
  };
}

function displayMode(state) {
  if (state.engineState === "STOPPED" && state.success === true) {
    return SECONDARY_DISPLAY_MODES.GAME_SUCCESS;
  }
  if (state.engineState === "STOPPED" && state.success === false) {
    return SECONDARY_DISPLAY_MODES.GAME_FAILURE;
  }
  if (state.engineState !== "SETTLING") {
    return SECONDARY_DISPLAY_MODES.HUD;
  }
  if (state.stageOutcome === "SUCCESS") {
    return SECONDARY_DISPLAY_MODES.STAGE_SUCCESS;
  }
  if (state.stageOutcome === "RETRY" || state.stageOutcome === "FAILURE") {
    return SECONDARY_DISPLAY_MODES.STAGE_FAILURE;
  }
  return SECONDARY_DISPLAY_MODES.SETTLING;
}

function nullableFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNonNegativeInteger(value) {
  const number = nullableFiniteNumber(value);
  return number === null ? null : Math.max(0, Math.floor(number));
}
