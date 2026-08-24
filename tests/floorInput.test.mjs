import assert from "node:assert/strict";
import test from "node:test";

import { floorClickPayload, floorInputPayload, sendFloorClick } from "../src/lib/floorInput.js";

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

test("Debug floor click is one atomic request and applies its response", async () => {
  const calls = [];
  const responses = [];
  const sendInput = async (payload) => {
    calls.push(payload);
    return { data: { accepted: true } };
  };

  const result = await sendFloorClick(sendInput, 0, 1, (response) => responses.push(response));

  assert.deepEqual(floorClickPayload(0, 1), { type: "click", x: 0, y: 1 });
  assert.deepEqual(calls, [{ type: "click", x: 0, y: 1 }]);
  assert.deepEqual(responses, [result]);
});
