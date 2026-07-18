import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import {
  extractErrorMessage,
  hasTermination,
  normalizeGameList,
  normalizeRuntimeState,
  touchViewForState,
} from "../src/lib/gameFlowState.js";
import {
  gameListFixture,
  preparingStateFixture,
  systemIdleStateFixture,
} from "../src/fixtures/gameFlowFixtures.js";

const require = createRequire(import.meta.url);
const {
  detectWindowKind,
  preparationPath,
  preparationRequest,
  sanitizePreparationPatch,
  shouldInitializeSystemIdle,
} = require("../electron/game-flow.cjs");

test("normalizeRuntimeState supports system idle without a game id", () => {
  const state = normalizeRuntimeState({ data: systemIdleStateFixture });
  assert.equal(state.engineState, "IDLE");
  assert.equal(state.gameId, null);
  assert.equal(state.running, false);
  assert.equal(touchViewForState(state), "IDLE");
});

test("normalizeRuntimeState restores preparation options and legacy defaults", () => {
  const state = normalizeRuntimeState(preparingStateFixture);
  assert.equal(state.preparation.sessionId, "prep-7");
  assert.equal(state.preparation.options.stageFailurePolicy, "RETRY");
  assert.equal(state.userCount, 2);
  assert.equal(normalizeRuntimeState({ engineState: "RUNNING" }).startLevelIndex, 0);
});

test("normalizeGameList unwraps backend Result data", () => {
  assert.deepEqual(normalizeGameList({ data: gameListFixture }), gameListFixture);
});

test("termination and error helpers preserve backend meaning", () => {
  assert.equal(hasTermination({ engineState: "STOPPED", success: false }), true);
  assert.equal(hasTermination({ engineState: "STOPPED" }), false);
  assert.equal(extractErrorMessage({ message: "会话已失效" }), "会话已失效");
  assert.equal(
    extractErrorMessage({ message: "IPC failed", response: { message: "后端拒绝了配置" } }),
    "后端拒绝了配置",
  );
  assert.equal(extractErrorMessage(null, "网络错误"), "网络错误");
});

test("lifecycle adapter exposes every supported state and rejects unknown values", () => {
  for (const engineState of ["IDLE", "PREPARING", "STARTING", "RUNNING", "SETTLING", "STOPPED"]) {
    assert.equal(touchViewForState({ engineState }), engineState);
  }
  assert.equal(touchViewForState({ engineState: "PAUSED" }), "LOADING");
});

test("game-flow entry only initializes a clean stopped runtime", () => {
  assert.equal(shouldInitializeSystemIdle({ engineState: "STOPPED", gameId: null }), true);
  assert.equal(
    shouldInitializeSystemIdle({ engineState: "STOPPED", success: true, gameId: 7 }),
    false,
  );
  for (const engineState of ["IDLE", "PREPARING", "STARTING", "RUNNING", "SETTLING"]) {
    assert.equal(shouldInitializeSystemIdle({ engineState }), false);
  }
});

test("preparation routes encode ids and patches only expose contract fields", () => {
  assert.equal(preparationPath("session / 7", "/confirm"), "/game/preparations/session%20%2F%207/confirm");
  assert.deepEqual(
    sanitizePreparationPatch({
      userCount: 3,
      startLevelIndex: 1,
      stageFailurePolicy: "RETRY",
      gameId: 9,
      dangerous: true,
    }),
    { userCount: 3, startLevelIndex: 1, stageFailurePolicy: "RETRY" },
  );
  assert.deepEqual(preparationRequest("create"), {
    pathname: "/game/preparations",
    options: { method: "POST", body: JSON.stringify({ launchMethod: "touch" }) },
  });
  assert.deepEqual(preparationRequest("select", "prep/7", 9), {
    pathname: "/game/preparations/prep%2F7/game",
    options: { method: "PUT", body: JSON.stringify({ gameId: 9 }) },
  });
  assert.deepEqual(preparationRequest("update", "prep/7", {
    userCount: 2,
    launchMethod: "touch",
    ignored: true,
  }), {
    pathname: "/game/preparations/prep%2F7",
    options: {
      method: "PATCH",
      body: JSON.stringify({ userCount: 2, launchMethod: "touch" }),
    },
  });
  assert.deepEqual(preparationRequest("confirm", "prep-7"), {
    pathname: "/game/preparations/prep-7/confirm",
    options: { method: "POST" },
  });
  assert.deepEqual(preparationRequest("cancel", "prep-7"), {
    pathname: "/game/preparations/prep-7",
    options: { method: "DELETE" },
  });
});

test("window kind recognises touch without changing debug compatibility", () => {
  assert.equal(detectWindowKind("?window=touch"), "touch");
  assert.equal(detectWindowKind("?window=debug"), "debug");
  assert.equal(detectWindowKind(""), "main");
});

test("sandboxed preload keeps window detection local and exposes the minimal Touch API", async () => {
  const source = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /require\(['"]\.\/game-flow\.cjs['"]\)/);
  assert.match(source, /game-flow:enter/);
  assert.match(source, /game:preparation:create/);
  assert.match(source, /removeListener\(['"]engine-state['"]/);
  assert.doesNotMatch(source, /backendBaseUrl|node:fs|child_process/);
});

test("Touch window is reusable, reconstructable, and closing it does not stop gameplay", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const createTouchWindow = source.slice(
    source.indexOf("function createTouchWindow()"),
    source.indexOf("function startFrameServer()"),
  );
  assert.match(createTouchWindow, /touchWindow\.focus\(\)/);
  assert.match(createTouchWindow, /touchWindow\s*=\s*null/);
  assert.match(createTouchWindow, /window=touch/);
  assert.doesNotMatch(createTouchWindow, /engine\/game\/stop|stopTouchGame/);
});

test("full game entry keeps the Touch idle video active across auxiliary windows", async () => {
  const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const touchSource = await readFile(
    new URL("../src/views/LedGameTouchView.vue", import.meta.url),
    "utf8",
  );
  const createTouchWindow = mainSource.slice(
    mainSource.indexOf("function createTouchWindow()"),
    mainSource.indexOf("function startFrameServer()"),
  );
  const enterGameFlow = mainSource.slice(
    mainSource.indexOf("async function enterGameFlow()"),
    mainSource.indexOf("function executePreparationRequest"),
  );

  assert.match(createTouchWindow, /backgroundThrottling:\s*false/);
  assert.ok(enterGameFlow.indexOf("createDebugWindow()") < enterGameFlow.indexOf("createTouchWindow()"));
  assert.match(touchSource, /visibilitychange/);
  assert.match(touchSource, /resumeIdleVideoWhenVisible/);
});

test("Debug LED preview uses one canvas instead of repainting a button per pixel", async () => {
  const demoSource = await readFile(new URL("../src/views/DemoView.vue", import.meta.url), "utf8");
  const canvasSource = await readFile(
    new URL("../src/components/DebugLedCanvas.vue", import.meta.url),
    "utf8",
  );

  assert.match(demoSource, /<DebugLedCanvas/);
  assert.doesNotMatch(demoSource, /class="led-cell"/);
  assert.match(canvasSource, /requestAnimationFrame/);
  assert.match(canvasSource, /emit\("cell-click"/);
  assert.match(canvasSource, /emit\("hover-cell"/);
});

test("Debug gameplay input applies the runtime response through the shared state adapter", async () => {
  const source = await readFile(new URL("../src/App.vue", import.meta.url), "utf8");
  const sendRuntimeGameInput = source.slice(
    source.indexOf("function sendRuntimeGameInput"),
    source.indexOf("function sendCellInput"),
  );

  assert.match(sendRuntimeGameInput, /applyState\(result\?\.data \?\? result\)/);
  assert.doesNotMatch(sendRuntimeGameInput, /applyGameRuntimeResult/);
});
