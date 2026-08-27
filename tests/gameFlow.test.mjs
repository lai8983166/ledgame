import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import {
  extractErrorMessage,
  hasTermination,
  normalizeGameList,
  normalizeRuntimeState,
  shouldIgnoreStalePreparationState,
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
  appendPreparationWristband,
  preparationPath,
  preparationRequest,
  queueRequest,
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

test("normalizeRuntimeState validates generic stage status fields", () => {
  const state = normalizeRuntimeState({
    engineState: "SETTLING",
    currentStageIndex: 2.9,
    stageOutcome: "retry",
  });
  assert.equal(state.currentStageIndex, 2);
  assert.equal(state.stageOutcome, "RETRY");
  assert.equal(normalizeRuntimeState({ currentStageIndex: -3 }).currentStageIndex, 0);
  assert.equal(normalizeRuntimeState({ stageOutcome: "IN_PROGRESS" }).stageOutcome, null);
  assert.equal(normalizeRuntimeState({}).currentStageIndex, null);
});

test("normalizeRuntimeState exposes explicit simulation mode and queue summary", () => {
  const state = normalizeRuntimeState({
    engineState: "RUNNING",
    runtimeMode: "SIMULATION",
    queueSummary: {
      deviceId: "device-a",
      current: { id: "current", status: "RUNNING", wristbandUid: "2283055618" },
      waiting: [{ id: "next", status: "WAITING", wristbandUid: "2283055619", gameId: 7 }],
    },
  });
  assert.equal(state.runtimeMode, "SIMULATION");
  assert.equal(state.queueSummary.waiting[0].wristbandUid, "2283055619");
  assert.equal(state.queueSummary.current.status, "RUNNING");
});

test("normalizeRuntimeState replaces and clears authoritative playerAccess", () => {
  const playerAccess = {
    member: { id: 12, phone: "13800138000", name: "张三", status: "ACTIVE" },
    access: {
      bindingId: 9,
      uid: "2283055618",
      status: "ACTIVE",
      durationMinutes: 60,
      startedAt: "2026-08-09T03:00:00Z",
      expiresAt: "2026-08-09T04:00:00Z",
      remainingSeconds: 3598,
    },
    platformPlayId: null,
    externalSessionId: "prep-21",
  };

  assert.deepEqual(normalizeRuntimeState({ engineState: "PREPARING", playerAccess }).playerAccess, playerAccess);
  assert.equal(normalizeRuntimeState({ engineState: "IDLE" }).playerAccess, null);
});

test("normalizeRuntimeState prefers ordered playerAccesses and falls back to legacy playerAccess", () => {
  const first = {
    member: { id: 12, phone: "13800138000", name: "多人甲", status: "ACTIVE" },
    access: { bindingId: 9, uid: "2283055618", status: "ACTIVE", durationMinutes: 60, remainingSeconds: 3598 },
  };
  const second = {
    member: { id: 13, phone: "13800138001", name: "多人乙", status: "ACTIVE" },
    access: { bindingId: 10, uid: "2283055619", status: "ACTIVE", durationMinutes: 60, remainingSeconds: 3598 },
  };

  const multiplayer = normalizeRuntimeState({
    engineState: "PREPARING",
    playerAccess: first,
    playerAccesses: [first, second],
  });
  assert.deepEqual(
    multiplayer.playerAccesses.map((participant) => participant.access.uid),
    ["2283055618", "2283055619"],
  );
  assert.equal(multiplayer.playerAccess.access.uid, "2283055618");
  const legacy = normalizeRuntimeState({ engineState: "PREPARING", playerAccess: first });
  assert.deepEqual(legacy.playerAccesses.map((participant) => participant.access.uid), ["2283055618"]);
});

test("stale preparation broadcasts cannot remove newly accepted multiplayer participants", () => {
  const access = (id, uid) => ({
    member: { id, phone: `1380013800${id}` },
    access: { bindingId: id, uid, status: "ACTIVE", durationMinutes: 60, remainingSeconds: 3000 },
  });
  const current = normalizeRuntimeState({
    engineState: "PREPARING",
    preparation: { sessionId: "prep-multi", revision: 4, options: { userCount: 3 } },
    playerAccesses: [access(1, "2283055618"), access(2, "2283055619")],
  });
  const stale = normalizeRuntimeState({
    engineState: "PREPARING",
    preparation: { sessionId: "prep-multi", revision: 4, options: { userCount: 3 } },
    playerAccesses: [access(1, "2283055618")],
  });
  assert.equal(shouldIgnoreStalePreparationState(current, stale), true);
});

test("Electron preparation wristband append uses authoritative order and count gate", () => {
  const state = {
    preparation: { options: { userCount: 3 } },
    playerAccesses: [
      { access: { uid: "2283055618" } },
      { access: { uid: "2283055619" } },
    ],
  };
  assert.deepEqual(appendPreparationWristband(state, "2283055620"), [
    "2283055618", "2283055619", "2283055620",
  ]);
  assert.throws(() => appendPreparationWristband(state, "2283055618"), /DUPLICATE_WRISTBAND/);
  assert.throws(() => appendPreparationWristband({
    ...state,
    preparation: { options: { userCount: 2 } },
  }, "2283055620"), /WRISTBAND_PARTICIPANT_LIMIT/);
});

test("stale preparation broadcasts cannot erase a scanned wristband", () => {
  const scanned = normalizeRuntimeState({
    engineState: "PREPARING",
    preparation: {
      sessionId: "prep-22",
      revision: 1,
      options: { tokenList: ["2283055618"] },
    },
    playerAccess: {
      member: { id: 12, phone: "13800138000" },
      access: {
        bindingId: 9,
        uid: "2283055618",
        status: "READY",
        durationMinutes: 60,
        remainingSeconds: 1800,
      },
    },
  });
  const stale = normalizeRuntimeState({
    engineState: "PREPARING",
    preparation: { sessionId: "prep-22", revision: 0, options: { tokenList: [] } },
  });

  assert.equal(shouldIgnoreStalePreparationState(scanned, stale), true);
  assert.equal(shouldIgnoreStalePreparationState(scanned, {
    engineState: "RUNNING",
  }), false);
});

test("normalizeGameList unwraps backend Result data", () => {
  const [game] = normalizeGameList({ data: gameListFixture });
  assert.equal(game.id, gameListFixture[0].id);
  assert.equal(game.name, gameListFixture[0].name);
  assert.equal(game.displayName, gameListFixture[0].name);
  assert.equal(game.maxPlayers, gameListFixture[0].participants);
  assert.deepEqual(game.levels, []);
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
  assert.deepEqual(JSON.parse(preparationRequest("create", null, {
    launchMethod: "wristband",
    runtimeMode: "SIMULATION",
  }).options.body), {
    launchMethod: "wristband",
    runtimeMode: "SIMULATION",
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
  assert.deepEqual(queueRequest("cancel", "item/7"), {
    pathname: "/engine/game/queue/item%2F7",
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

test("wristband IPC exposes the scanned UID only", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const scanHandler = source.slice(
    source.indexOf("const wristbandReader = createKeyboardWristbandReader()"),
    source.indexOf("touchWindow.once('ready-to-show'"),
  );

  assert.match(scanHandler, /wristband-scanned[\s\S]*wristbandId:\s*result\.wristbandId/);
  assert.doesNotMatch(scanHandler, /balance\s*:/);
  assert.doesNotMatch(scanHandler, /member\s*:/);
  assert.doesNotMatch(scanHandler, /binding\s*:/);
});

test("focused Touch numeric fields suspend keyboard wristband capture", async () => {
  const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const preloadSource = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const readerGate = mainSource.slice(
    mainSource.indexOf("const wristbandReader = createKeyboardWristbandReader()"),
    mainSource.indexOf("touchWindow.once('ready-to-show'")
  );

  assert.match(readerGate, /touchKeyboardEditableFocused/);
  assert.match(readerGate, /if \(touchKeyboardEditableFocused\)/);
  assert.match(preloadSource, /focusin/);
  assert.match(preloadSource, /game:editable-focus/);
});

test("Touch wristband flow renders only authoritative playerAccess balance and recovery copy", async () => {
  const source = await readFile(
    new URL("../src/views/LedGameTouchView.vue", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /payload\?\.balance|wristbandRead\.value\?\.balance/);
  assert.match(source, /runtimeState\.value\.playerAccess/);
  assert.match(source, /playerAccessRemainingSeconds/);
  assert.match(source, /playerAccess\.access\.durationMinutes/);
  assert.match(source, /playerAccessExpiryLabel/);
  assert.match(source, /wristbandErrorMessageKey/);
  assert.match(source, /touch\.activatedTimeContinues/);
  assert.match(source, /\["PREPARING",\s*"STARTING",\s*"RUNNING"\]/);
});

test("Touch wristband scan and confirm keep a single in-flight action", async () => {
  const source = await readFile(
    new URL("../src/views/LedGameTouchView.vue", import.meta.url),
    "utf8",
  );
  const scanHandler = source.slice(
    source.indexOf("function handleWristbandScanned"),
    source.indexOf("async function loadGames"),
  );
  const confirmHandler = source.slice(
    source.indexOf("async function confirmPreparation"),
    source.indexOf("async function cancelPreparation"),
  );

  assert.match(scanHandler, /busyAction\.value/);
  assert.match(scanHandler, /refreshOnError:\s*true/);
  assert.match(confirmHandler, /busyAction\.value/);
  assert.match(confirmHandler, /await refreshState\(\)/);
});

test("wristband entry wakes from IDLE and scans only inside the active preparation", async () => {
  const touchSource = await readFile(
    new URL("../src/views/LedGameTouchView.vue", import.meta.url),
    "utf8",
  );
  const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const idlePrompt = touchSource.slice(
    touchSource.indexOf("const idlePrompt = computed"),
    touchSource.indexOf("const showIdleVideo"),
  );
  const wakeTouch = touchSource.slice(
    touchSource.indexOf("async function wakeTouch"),
    touchSource.indexOf("function handleWristbandScanned"),
  );
  const readerGate = mainSource.slice(
    mainSource.indexOf("const wristbandReader = createKeyboardWristbandReader()"),
    mainSource.indexOf("touchWindow.once('ready-to-show'"),
  );

  assert.doesNotMatch(idlePrompt, /touch\.scanWristband/);
  assert.doesNotMatch(wakeTouch, /if \(isWristbandEntry\.value\) return/);
  assert.match(wakeTouch, /api\.createPreparation\(\)/);
  assert.match(readerGate, /engineState[^]*PREPARING/);
  assert.match(readerGate, /playerAccess/);
  assert.doesNotMatch(readerGate, /engineState[^]*IDLE/);
});

test("wristband scan binds UID to the current PREPARING session and gates confirm", async () => {
  const touchSource = await readFile(
    new URL("../src/views/LedGameTouchView.vue", import.meta.url),
    "utf8",
  );
  const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const preloadSource = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const scanHandler = touchSource.slice(
    touchSource.indexOf("function handleWristbandScanned"),
    touchSource.indexOf("async function loadGames"),
  );
  const ipcHandler = mainSource.slice(
    mainSource.indexOf("ipcMain.handle('game:preparation:create-wristband'"),
    mainSource.indexOf("ipcMain.handle('game:preparation:select'"),
  );

  assert.match(scanHandler, /view\.value !== "PREPARING"/);
  assert.match(scanHandler, /preparation\.value\?\.sessionId/);
  assert.match(scanHandler, /createWristbandPreparation\(sessionId, wristbandId\)/);
  assert.doesNotMatch(scanHandler, /setTimeout\([\s\S]*createWristbandPreparation/);
  assert.match(ipcHandler, /sessionId, value/);
  assert.match(ipcHandler, /executePreparationRequest\('update', sessionId/);
  assert.match(ipcHandler, /launchMethod:\s*'wristband'/);
  assert.match(ipcHandler, /tokenList:\s*appendPreparationWristband\(latestEngineState, wristbandId\)/);
  assert.match(preloadSource, /createWristbandPreparation:\s*\(sessionId, wristbandId\)/);
  assert.match(touchSource, /hasRequiredWristbandParticipants/);
  assert.match(touchSource, /touch\.scanWristbandHint/);
});

test("Touch window is reusable, reconstructable, and closing it does not stop gameplay", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const createTouchWindow = source.slice(
    source.indexOf("function activateTouchWindow("),
    source.indexOf("function startFrameServer()"),
  );
  assert.match(createTouchWindow, /show:\s*false/);
  assert.match(createTouchWindow, /ready-to-show/);
  assert.match(createTouchWindow, /targetWindow\.show\(\)/);
  assert.match(createTouchWindow, /targetWindow\.focus\(\)/);
  assert.match(createTouchWindow, /targetWindow\.webContents\.focus\(\)/);
  assert.match(createTouchWindow, /setImmediate\(\(\)\s*=>\s*activateTouchWindow/);
  assert.match(createTouchWindow, /touchWindow\s*=\s*null/);
  assert.match(createTouchWindow, /window=touch/);
  assert.doesNotMatch(createTouchWindow, /engine\/game\/stop|stopTouchGame/);
});

test("Touch preparation options require a game but remain focusable during async actions", async () => {
  const source = await readFile(
    new URL("../src/views/LedGameTouchView.vue", import.meta.url),
    "utf8",
  );
  const playerInput = source.match(/<input[^>]*v-model\.number="draft\.userCount"[^>]*>/)?.[0];
  const startLevelInput = source.match(
    /<input[^>]*v-model\.number="draft\.startLevelIndex"[^>]*>/,
  )?.[0];

  assert.ok(playerInput);
  assert.ok(startLevelInput);
  assert.match(playerInput, /data-testid="game-player-count-input"/);
  assert.match(startLevelInput, /data-testid="game-start-level-input"/);
  assert.match(playerInput, /canChangePlayerCount/);
  assert.match(playerInput, /@change="syncPlayerCount\(\$event\)"/);
  assert.match(startLevelInput, /:disabled="!selectedGameId"/);
  assert.match(startLevelInput, /@change="blurNumericInput"/);
  assert.doesNotMatch(playerInput, /busyAction/);
  assert.doesNotMatch(startLevelInput, /busyAction/);
  assert.match(source, /<fieldset class="touch-fieldset" :disabled="!selectedGameId">/);
});

test("packaged windows keep stable content bounds when first activated", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");

  assert.match(source, /Menu\.setApplicationMenu\(null\)/);
  assert.equal((source.match(/autoHideMenuBar:\s*false/g) || []).length, 4);
  assert.equal((source.match(/\.setMenuBarVisibility\(false\)/g) || []).length, 4);
  assert.doesNotMatch(source, /setAutoHideMenuBar\(true\)/);
});

test("full game entry keeps the Touch idle video active across auxiliary windows", async () => {
  const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const touchSource = await readFile(
    new URL("../src/views/LedGameTouchView.vue", import.meta.url),
    "utf8",
  );
  const createTouchWindow = mainSource.slice(
    mainSource.indexOf("function createTouchWindow("),
    mainSource.indexOf("function startFrameServer()"),
  );
  const enterGameFlow = mainSource.slice(
    mainSource.indexOf("async function enterGameFlow()"),
    mainSource.indexOf("function executePreparationRequest"),
  );

  assert.match(createTouchWindow, /backgroundThrottling:\s*false/);
  assert.match(enterGameFlow, /windowPlan\.openDebugPanel/);
  assert.match(enterGameFlow, /createDebugWindow\([^)]*splitBounds\.debug/);
  assert.match(enterGameFlow, /createTouchWindow\(windowPlan\.presentationMode, splitBounds\?\.touch\)/);
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

test("Debug Panel exposes a deterministic natural-completion action through production input", async () => {
  const appSource = await readFile(new URL("../src/App.vue", import.meta.url), "utf8");
  const floorInputSource = await readFile(new URL("../src/lib/floorInput.js", import.meta.url), "utf8");
  const source = await readFile(new URL("../src/views/DemoView.vue", import.meta.url), "utf8");

  assert.match(source, /data-testid="game-debug-complete-natural"/);
  assert.match(source, /\$emit\('game-input', 0, 0\)/);
  assert.match(appSource, /await sendFloorClick\(api\.sendGameInput, x, y/);
  assert.match(floorInputSource, /type:\s*"click"/);
  assert.match(floorInputSource, /const response = await sendInput\(floorClickPayload\(x, y\)\)/);
  assert.doesNotMatch(
    source.match(/<button data-testid="game-debug-complete-natural"[^>]*>/)?.[0] || "",
    /debug-command|endGame|stageResult/,
  );
});

test("runtime state query does not masquerade as a gameplay input", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const requestCurrentGameState = source.slice(
    source.indexOf("function requestCurrentGameState()"),
    source.indexOf("const ACTIVE_DATABASE_REFRESH_STATES"),
  );

  assert.match(requestCurrentGameState, /engineStateRequest\('\/engine\/game\/state'\)/);
  assert.doesNotMatch(requestCurrentGameState, /type:\s*'state'/);
});
