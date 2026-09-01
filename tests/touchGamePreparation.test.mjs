import assert from "node:assert/strict";
import test from "node:test";
import {
  createTouchCountdown,
  createTouchPreparationStepTimeout,
  isTouchPreparationStepTimeoutCurrent,
  isTouchPreparationStepTimeoutActive,
  moveTouchCarousel,
  normalizeTouchGameDocument,
  normalizeTouchPlayerCount,
  touchCarouselSlots,
  hasRequiredWristbandParticipants,
  TOUCH_PREPARATION_STEP_TIMEOUT_SECONDS,
} from "../src/lib/touchGamePreparation.js";

test("Touch game preparation constrains players and wraps the game carousel", () => {
  assert.equal(normalizeTouchPlayerCount(6), 6);
  assert.equal(normalizeTouchPlayerCount(7, 3), 3);
  assert.equal(moveTouchCarousel(0, -1, 4), 3);
  assert.equal(moveTouchCarousel(3, 1, 4), 0);
  assert.deepEqual(
    touchCarouselSlots(["simple", "normal", "difficult"], 0).map(
      ({ item, offset }) => [item, offset],
    ),
    [
      ["difficult", -1],
      ["simple", 0],
      ["normal", 1],
    ],
  );
});

test("Touch multiplayer wristband gate requires the selected number of authoritative players", () => {
  assert.equal(hasRequiredWristbandParticipants([], 2), false);
  assert.equal(hasRequiredWristbandParticipants([{ access: { uid: "1" } }], 2), false);
  assert.equal(hasRequiredWristbandParticipants([
    { access: { uid: "1" } },
    { access: { uid: "2" } },
  ], 2), true);
  assert.equal(hasRequiredWristbandParticipants([
    { access: { uid: "1" } },
    { access: { uid: "2" } },
  ], 3), false);
});

test("Touch game preparation exposes real level indexes and normalized limits", () => {
  const document = normalizeTouchGameDocument({
    data: {
      id: 8,
      name: "normal",
      description: "Clear every scoring tile.",
      globalTimeLimit: true,
      globalTimeLimitValue: 900,
      levels: [
        {
          label: "Opening",
          option: {
            timeLimitMode: "CYCLE_SECONDS",
            timeLimitValue: 30,
            lifeLimitMode: "LIMITED",
            lifeLimitValue: 3,
          },
        },
        { option: { timeLimitMode: "UNLIMITED", lifeLimitMode: "UNLIMITED" } },
      ],
    },
  });

  assert.equal(document.levels[0].index, 0);
  assert.equal(document.levels[0].label, "Opening");
  assert.equal(document.levels[0].option.timeLimitValue, 30);
  assert.equal(document.levels[0].option.lifeLimitValue, 3);
  assert.equal(document.levels[1].index, 1);
  assert.equal(document.levels[1].label, "Level 2");
  assert.equal(document.globalTimeLimitValue, 900);
});

test("Touch countdown completes only after every tick and cancellation prevents confirmation", () => {
  const scheduled = [];
  const ticks = [];
  let completions = 0;
  const cancel = createTouchCountdown({
    seconds: 3,
    onTick: (value) => ticks.push(value),
    onComplete: () => {
      completions += 1;
    },
    schedule: (callback) => {
      scheduled.push(callback);
      return scheduled.length - 1;
    },
    cancelSchedule: () => {},
  });

  assert.deepEqual(ticks, [3]);
  scheduled[0]();
  assert.deepEqual(ticks, [3, 2]);
  assert.equal(completions, 0);
  scheduled[1]();
  assert.deepEqual(ticks, [3, 2, 1]);
  assert.equal(completions, 0);
  scheduled[2]();
  assert.equal(completions, 1);

  let cancelledCallback = null;
  let cancelledCompletion = false;
  const stop = createTouchCountdown({
    seconds: 2,
    onComplete: () => {
      cancelledCompletion = true;
    },
    schedule: (callback) => {
      cancelledCallback = callback;
      return 1;
    },
    cancelSchedule: () => {},
  });
  stop();
  cancelledCallback();
  assert.equal(cancelledCompletion, false);
  cancel();
});

test("Game presentation preparation times only the three interactive wizard steps", () => {
  const active = (step, overrides = {}) =>
    isTouchPreparationStepTimeoutActive({
      presentationMode: "game",
      runtimeView: "PREPARING",
      sessionId: "preparation-1",
      step,
      ...overrides,
    });

  assert.equal(TOUCH_PREPARATION_STEP_TIMEOUT_SECONDS, 20);
  assert.equal(active("players"), true);
  assert.equal(active("game"), true);
  assert.equal(active("level"), true);
  assert.equal(active("countdown"), false);
  assert.equal(active("players", { presentationMode: "debug" }), false);
  assert.equal(active("players", { runtimeView: "IDLE" }), false);
  assert.equal(active("players", { sessionId: null }), false);
});

test("Preparation step timeout identity rejects stale steps and sessions", () => {
  const current = {
    presentationMode: "game",
    runtimeView: "PREPARING",
    sessionId: "preparation-2",
    step: "game",
  };

  assert.equal(
    isTouchPreparationStepTimeoutCurrent(
      { sessionId: "preparation-2", step: "game" },
      current,
    ),
    true,
  );
  assert.equal(
    isTouchPreparationStepTimeoutCurrent(
      { sessionId: "preparation-1", step: "game" },
      current,
    ),
    false,
  );
  assert.equal(
    isTouchPreparationStepTimeoutCurrent(
      { sessionId: "preparation-2", step: "players" },
      current,
    ),
    false,
  );
});

test("Preparation step timeout ticks to zero once and can be cancelled", () => {
  const scheduled = [];
  const ticks = [];
  let timeouts = 0;
  const stop = createTouchPreparationStepTimeout({
    seconds: 3,
    onTick: (value) => ticks.push(value),
    onTimeout: () => {
      timeouts += 1;
    },
    schedule: (callback) => {
      scheduled.push(callback);
      return scheduled.length - 1;
    },
    cancelSchedule: () => {},
  });

  assert.deepEqual(ticks, [3]);
  scheduled[0]();
  scheduled[1]();
  scheduled[2]();
  assert.deepEqual(ticks, [3, 2, 1, 0]);
  assert.equal(timeouts, 1);

  let cancelledCallback = null;
  let cancelledTimeout = false;
  const cancel = createTouchPreparationStepTimeout({
    seconds: 2,
    onTimeout: () => {
      cancelledTimeout = true;
    },
    schedule: (callback) => {
      cancelledCallback = callback;
      return 1;
    },
    cancelSchedule: () => {},
  });
  cancel();
  cancelledCallback();
  assert.equal(cancelledTimeout, false);
  stop();
});
