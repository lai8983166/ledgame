import test from "node:test";
import assert from "node:assert/strict";
import {
  createSecondaryDisplayPresentation,
  SECONDARY_DISPLAY_MODES,
} from "../src/lib/secondaryDisplayPresentation.js";

test("secondary display prioritizes stage and game outcomes from lifecycle state", () => {
  assert.equal(createSecondaryDisplayPresentation({
    engineState: "SETTLING", stageOutcome: "SUCCESS",
  }).mode, SECONDARY_DISPLAY_MODES.STAGE_SUCCESS);
  const retry = createSecondaryDisplayPresentation({
    engineState: "SETTLING", stageOutcome: "RETRY",
  });
  assert.equal(retry.mode, SECONDARY_DISPLAY_MODES.STAGE_FAILURE);
  assert.equal(retry.retrying, true);
  assert.equal(createSecondaryDisplayPresentation({
    engineState: "STOPPED", success: true, stageOutcome: "FAILURE",
  }).mode, SECONDARY_DISPLAY_MODES.GAME_SUCCESS);
  assert.equal(createSecondaryDisplayPresentation({
    engineState: "STOPPED", success: false,
  }).mode, SECONDARY_DISPLAY_MODES.GAME_FAILURE);
});

test("secondary display does not invent results when outcome data is absent", () => {
  assert.equal(createSecondaryDisplayPresentation({
    engineState: "SETTLING",
  }).mode, SECONDARY_DISPLAY_MODES.SETTLING);
  assert.equal(createSecondaryDisplayPresentation({
    engineState: "STOPPED",
  }).mode, SECONDARY_DISPLAY_MODES.HUD);
});

test("secondary display derives player-facing level and exact life hearts", () => {
  const current = createSecondaryDisplayPresentation({
    engineState: "RUNNING",
    currentStageIndex: 4,
    gameplay: { levelIndex: 1, score: 80, life: 3 },
  });
  assert.equal(current.stageNumber, 5);
  assert.equal(current.score, 80);
  assert.equal(current.life, 3);
  assert.equal(current.hearts, "♥♥♥");

  const legacy = createSecondaryDisplayPresentation({
    engineState: "RUNNING", gameplay: { levelIndex: 2, life: 0 },
  });
  assert.equal(legacy.stageNumber, 3);
  assert.equal(legacy.life, 0);
  assert.equal(legacy.hearts, "");
  assert.equal(createSecondaryDisplayPresentation({ engineState: "RUNNING" }).hearts, null);
});

test("secondary display preserves Rank players while adding generic stage context", () => {
  const players = Array.from({ length: 6 }, (_, index) => ({
    playerNumber: index + 1,
    rank: index + 1,
    stageScore: 10 - index,
    totalScore: 30 - index,
  }));
  const presentation = createSecondaryDisplayPresentation({
    engineState: "RUNNING",
    gameType: "rank",
    currentStageIndex: 1,
    gameplay: { players },
  });

  assert.equal(presentation.isRank, true);
  assert.equal(presentation.stageNumber, 2);
  assert.deepEqual(presentation.rankPlayers, players);
});
