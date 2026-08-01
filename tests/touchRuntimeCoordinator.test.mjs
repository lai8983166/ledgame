import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmTouchPreparationTransaction,
  createTouchStateCoordinator,
  returnTouchRuntimeToIdle,
} from "../src/lib/touchRuntimeCoordinator.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("a Touch state broadcast wins over an older pending refresh", async () => {
  const pending = deferred();
  const appliedStates = [];
  const coordinator = createTouchStateCoordinator({
    readState: () => pending.promise,
    applyState: (state) => appliedStates.push(state),
  });

  const refresh = coordinator.refresh();
  coordinator.applyBroadcast({ revision: 2, phase: "RUNNING" });
  pending.resolve({ data: { revision: 1, phase: "PREPARING" } });

  const result = await refresh;
  assert.equal(result.applied, false);
  assert.deepEqual(appliedStates, [{ revision: 2, phase: "RUNNING" }]);
});

test("Touch refresh applies the backend state when no newer broadcast exists", async () => {
  const appliedStates = [];
  const coordinator = createTouchStateCoordinator({
    readState: async () => ({ data: { revision: 3, phase: "STOPPED" } }),
    applyState: (state) => appliedStates.push(state),
  });

  const result = await coordinator.refresh();

  assert.equal(result.applied, true);
  assert.deepEqual(appliedStates, [{ revision: 3, phase: "STOPPED" }]);
});

test("Touch confirmation updates options before confirming the preparation", async () => {
  const calls = [];
  const appliedStates = [];

  const result = await confirmTouchPreparationTransaction({
    api: {
      async updatePreparation(sessionId, patch) {
        calls.push(["update", sessionId, patch]);
        return { data: { revision: 4, phase: "PREPARING" } };
      },
      async confirmPreparation(sessionId) {
        calls.push(["confirm", sessionId]);
        return { data: { revision: 5, phase: "STARTING" } };
      },
    },
    sessionId: "prep-4",
    patch: { userCount: 2, startLevelIndex: 1 },
    applyState: (state) => appliedStates.push(state),
  });

  assert.deepEqual(calls, [
    ["update", "prep-4", { userCount: 2, startLevelIndex: 1 }],
    ["confirm", "prep-4"],
  ]);
  assert.deepEqual(appliedStates, [
    { revision: 4, phase: "PREPARING" },
    { revision: 5, phase: "STARTING" },
  ]);
  assert.equal(result.data.phase, "STARTING");
});

test("failed Touch option update never confirms and triggers authoritative recovery", async () => {
  const failure = new Error("preparation expired");
  let confirmCalls = 0;
  const recovered = [];

  await assert.rejects(
    confirmTouchPreparationTransaction({
      api: {
        async updatePreparation() {
          throw failure;
        },
        async confirmPreparation() {
          confirmCalls += 1;
        },
      },
      sessionId: "prep-expired",
      patch: { userCount: 1 },
      applyState() {},
      recover: async (error) => recovered.push(error),
    }),
    failure,
  );

  assert.equal(confirmCalls, 0);
  assert.deepEqual(recovered, [failure]);
});

test("failed Touch confirmation recovers after applying the accepted option update", async () => {
  const failure = new Error("engine rejected confirmation");
  const appliedStates = [];
  const recovered = [];

  await assert.rejects(
    confirmTouchPreparationTransaction({
      api: {
        async updatePreparation() {
          return { data: { revision: 8, phase: "PREPARING" } };
        },
        async confirmPreparation() {
          throw failure;
        },
      },
      sessionId: "prep-8",
      patch: { userCount: 3 },
      applyState: (state) => appliedStates.push(state),
      recover: async (error) => recovered.push(error),
    }),
    failure,
  );

  assert.deepEqual(appliedStates, [{ revision: 8, phase: "PREPARING" }]);
  assert.deepEqual(recovered, [failure]);
});

test("Touch return-to-idle cancels preparation before entering system idle", async () => {
  const calls = [];
  const appliedStates = [];

  await returnTouchRuntimeToIdle({
    api: {
      async cancelPreparation(sessionId) {
        calls.push(["cancel", sessionId]);
        return { data: { engineState: "IDLE", revision: 2 } };
      },
      async startSystemIdle() {
        calls.push(["idle"]);
        return { data: { engineState: "IDLE", revision: 3 } };
      },
    },
    engineState: "PREPARING",
    preparationSessionId: "prep-2",
    applyState: (state) => appliedStates.push(state),
  });

  assert.deepEqual(calls, [["cancel", "prep-2"], ["idle"]]);
  assert.deepEqual(appliedStates.map((state) => state.revision), [2, 3]);
});

test("Touch return-to-idle stops an active game before entering system idle", async () => {
  const calls = [];

  await returnTouchRuntimeToIdle({
    api: {
      async stopTouchGame() {
        calls.push(["stop"]);
        return { data: { engineState: "STOPPED" } };
      },
      async startSystemIdle() {
        calls.push(["idle"]);
        return { data: { engineState: "IDLE" } };
      },
    },
    engineState: "RUNNING",
    applyState() {},
  });

  assert.deepEqual(calls, [["stop"], ["idle"]]);
});

test("Touch return-to-idle does not stop an inactive runtime", async () => {
  const calls = [];

  await returnTouchRuntimeToIdle({
    api: {
      async stopTouchGame() {
        calls.push(["stop"]);
      },
      async startSystemIdle() {
        calls.push(["idle"]);
        return { data: { engineState: "IDLE" } };
      },
    },
    engineState: "STOPPED",
    applyState() {},
  });

  assert.deepEqual(calls, [["idle"]]);
});
