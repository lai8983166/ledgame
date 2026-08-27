import { normalizeRuntimeState } from "./gameFlowState.js";

export const SECONDARY_DISPLAY_MODES = Object.freeze({
  HUD: "HUD",
  SETTLING: "SETTLING",
  STAGE_SUCCESS: "STAGE_SUCCESS",
  STAGE_FAILURE: "STAGE_FAILURE",
  GAME_SUCCESS: "GAME_SUCCESS",
  GAME_FAILURE: "GAME_FAILURE",
});

export function createSecondaryDisplayPresentation(value) {
  const state = normalizeRuntimeState(value);
  const gameplay = state.gameplay || {};
  const fallbackStageIndex = nullableNonNegativeInteger(gameplay.levelIndex);
  const stageIndex = state.currentStageIndex ?? fallbackStageIndex;
  const score = nullableFiniteNumber(gameplay.score);
  const life = nullableNonNegativeInteger(gameplay.life);

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

function nullableNonNegativeInteger(value) {
  const number = nullableFiniteNumber(value);
  return number === null ? null : Math.max(0, Math.floor(number));
}
