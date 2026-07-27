import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createElc408Diagnostics,
  summarizeDebugState,
  summarizeElc408Error,
} from "../src/lib/elc408/elc408Diagnostics.js";

function recordingConsole() {
  const calls = [];
  return {
    calls,
    debug(message, summary) {
      calls.push({ message, summary });
    },
  };
}

test("summarizeDebugState exposes only stable authoritative fields", () => {
  const summary = summarizeDebugState({
    data: {
      owner: "DEBUG",
      debugRunning: true,
      controllerModel: "HC04",
      channelsPerController: 4,
      controllers: [{ mac: "A" }, { mac: "B" }],
      lastRgbFrame: "must-not-leak",
    },
  });

  assert.deepEqual(summary, {
    owner: "DEBUG",
    running: true,
    controllerModel: "HC04",
    channelsPerController: 4,
    controllerCount: 2,
  });
});

test("state diagnostics are deduplicated", () => {
  const target = recordingConsole();
  const diagnostics = createElc408Diagnostics(target);
  const state = {
    owner: "UPSTREAM",
    debugRunning: false,
    controllerModel: "HC08",
    channelsPerController: 8,
    controllers: [],
  };

  assert.equal(diagnostics.stateChanged(state), true);
  assert.equal(diagnostics.stateChanged({ ...state }), false);
  assert.equal(diagnostics.stateChanged({ ...state, debugRunning: true }), true);
  assert.equal(target.calls.length, 2);
});

test("operation diagnostics contain bounded summaries without packet data", () => {
  const target = recordingConsole();
  const diagnostics = createElc408Diagnostics(target);

  diagnostics.started("Search", {
    controllerModel: "HC04",
    networkInterfaceSelected: true,
  });
  diagnostics.succeeded("Start", {
    owner: "DEBUG",
    debugRunning: true,
    controllerModel: "HC04",
    channelsPerController: 4,
    controllers: [{ mac: "A" }, { mac: "B" }],
  });
  diagnostics.failed("Stop", new Error(`CONTROLLER_COUNT_MISMATCH: ${"x".repeat(400)}`));

  assert.equal(target.calls.length, 3);
  assert.match(target.calls[0].message, /^\[ELC408\] Search started$/);
  assert.deepEqual(target.calls[1].summary, {
    owner: "DEBUG",
    running: true,
    controllerModel: "HC04",
    channelsPerController: 4,
    controllerCount: 2,
  });
  assert.equal(target.calls[2].summary.code, "CONTROLLER_COUNT_MISMATCH");
  assert.ok(target.calls[2].summary.message.length <= 243);
  assert.doesNotMatch(JSON.stringify(target.calls), /hex|rgbFrame|packet/i);
});

test("summarizeElc408Error keeps unknown backend messages as fallback", () => {
  assert.deepEqual(summarizeElc408Error(new Error("plain failure")), {
    code: "",
    message: "plain failure",
  });
});
