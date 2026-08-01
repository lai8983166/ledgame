import assert from "node:assert/strict";
import test from "node:test";
import {
  createTouchCountdown,
  moveTouchCarousel,
  normalizeTouchGameDocument,
  normalizeTouchPlayerCount,
  touchCarouselSlots,
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
