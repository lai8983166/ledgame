import test from "node:test";
import assert from "node:assert/strict";
import {
  createSecondaryDisplayPresentation,
  formatGameTime,
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

test("secondary display presents finite, paused, unlimited and unavailable global game time", () => {
  const running = createSecondaryDisplayPresentation({
    engineState: "RUNNING",
    gameTime: { mode: "LIMITED", remainingMillis: 61_000, running: true },
  }, { observedAt: 10_000, now: 11_100 });
  assert.deepEqual(running.gameTime, {
    visible: true,
    mode: "LIMITED",
    remainingMillis: 59_900,
    text: "01:00",
  });

  const paused = createSecondaryDisplayPresentation({
    engineState: "SETTLING",
    gameTime: { mode: "LIMITED", remainingMillis: 61_000, running: false },
  }, { observedAt: 10_000, now: 50_000 });
  assert.equal(paused.gameTime.text, "01:01");

  const unlimited = createSecondaryDisplayPresentation({
    engineState: "RUNNING",
    gameTime: { mode: "UNLIMITED", running: true },
  });
  assert.equal(unlimited.gameTime.mode, "UNLIMITED");
  assert.equal(unlimited.gameTime.text, null);

  assert.deepEqual(createSecondaryDisplayPresentation({
    engineState: "RUNNING",
  }).gameTime, { visible: true, mode: "UNKNOWN", remainingMillis: null, text: "--" });
  assert.equal(createSecondaryDisplayPresentation({
    engineState: "STOPPED",
    gameTime: { mode: "LIMITED", remainingMillis: 20_000, running: false },
  }).gameTime.visible, false);
});

test("global game time formatting preserves positive partial seconds and hours", () => {
  assert.equal(formatGameTime(0), "00:00");
  assert.equal(formatGameTime(1), "00:01");
  assert.equal(formatGameTime(999), "00:01");
  assert.equal(formatGameTime(60_000), "01:00");
  assert.equal(formatGameTime(3_661_000), "01:01:01");
});
