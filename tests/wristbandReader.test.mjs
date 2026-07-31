import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createKeyboardWristbandReader,
  normalizeWristbandId,
} = require("../electron/wristband-reader.cjs");

test("keyboard reader emits one wristband id only after the terminating Enter", () => {
  let time = 0;
  const reader = createKeyboardWristbandReader({ now: () => time });

  for (const key of "2281487330") {
    assert.deepEqual(reader.push({ type: "keyDown", key }), {
      consumed: true,
      wristbandId: null,
    });
    time += 15;
  }

  assert.deepEqual(reader.push({ type: "keyDown", key: "Enter" }), {
    consumed: true,
    wristbandId: "2281487330",
  });
  assert.deepEqual(reader.push({ type: "keyDown", key: "Enter" }), {
    consumed: false,
    wristbandId: null,
  });
});

test("keyboard reader rejects slow, malformed, and incomplete keyboard input", () => {
  let time = 0;
  const reader = createKeyboardWristbandReader({ now: () => time });

  for (const key of "228148") {
    reader.push({ type: "keyDown", key });
    time += 15;
  }
  time += 150;
  for (const key of "7330") {
    reader.push({ type: "keyDown", key });
    time += 15;
  }
  assert.equal(reader.push({ type: "keyDown", key: "Enter" }).wristbandId, null);

  for (const key of "2281A87330") {
    reader.push({ type: "keyDown", key });
    time += 10;
  }
  assert.equal(reader.push({ type: "keyDown", key: "Enter" }).wristbandId, null);
  assert.equal(normalizeWristbandId(" 2281487330 "), "2281487330");
  assert.equal(normalizeWristbandId("short"), null);
});
