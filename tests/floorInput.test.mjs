import assert from "node:assert/strict";
import test from "node:test";

import { floorInputPayload, sendFloorTap } from "../src/lib/floorInput.js";

test("floor input payload exposes production tile DOWN and UP semantics", () => {
  assert.deepEqual(floorInputPayload("DOWN", 2, 3), {
    type: "tile",
    x: 2,
    y: 3,
    value: 1,
  });
  assert.deepEqual(floorInputPayload("UP", 2, 3), {
    type: "tile",
    x: 2,
    y: 3,
    value: 0,
  });
  assert.throws(() => floorInputPayload("CLICK", 2, 3), /Unsupported floor input action/);
});

test("Debug floor tap waits for DOWN before sending UP and applies both responses", async () => {
  const calls = [];
  const responses = [];
  let releaseDown;
  const downPending = new Promise((resolve) => {
    releaseDown = resolve;
  });
  const sendInput = async (payload) => {
    calls.push(payload);
    if (payload.value === 1) {
      await downPending;
    }
    return { data: { value: payload.value } };
  };

  const tap = sendFloorTap(sendInput, 0, 0, (response) => responses.push(response));
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].value, 1);

  releaseDown();
  await tap;

  assert.deepEqual(calls.map((call) => call.value), [1, 0]);
  assert.deepEqual(responses.map((response) => response.data.value), [1, 0]);
});
