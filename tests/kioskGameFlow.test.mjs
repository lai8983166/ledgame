import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  debugGameSplitBounds,
  gameFlowWindowPlan,
  isTouchExitCode,
  preparationRequest,
} = require("../electron/game-flow.cjs");

test("debug game mode splits the selected work area into touch-left and debug-right panes", () => {
  assert.deepEqual(debugGameSplitBounds({ x: 10, y: 20, width: 1919, height: 1079 }), {
    touch: { x: 10, y: 20, width: 959, height: 1079 },
    debug: { x: 969, y: 20, width: 960, height: 1079 },
  });
});

test("game flow window plan preserves debug defaults and isolates game mode", () => {
  assert.deepEqual(gameFlowWindowPlan(undefined), {
    presentationMode: "debug",
    openDebugPanel: true,
    fullScreenTouch: false,
  });
  assert.deepEqual(gameFlowWindowPlan("game"), {
    presentationMode: "game",
    openDebugPanel: false,
    fullScreenTouch: true,
  });
});

test("preparation creation maps every supported configured entry method", () => {
  for (const method of ["touch", "coin", "wristband"]) {
    assert.deepEqual(preparationRequest("create", null, method), {
      pathname: "/game/preparations",
      options: {
        method: "POST",
        body: JSON.stringify({ launchMethod: method }),
      },
    });
  }
  assert.match(preparationRequest("create", null, "unknown").options.body, /"touch"/);
  assert.deepEqual(
    preparationRequest("create", null, {
      launchMethod: "wristband",
      tokenList: ["2281487330"],
    }),
    {
      pathname: "/game/preparations",
      options: {
        method: "POST",
        body: JSON.stringify({
          launchMethod: "wristband",
          tokenList: ["2281487330"],
        }),
      },
    },
  );
});

test("operator exit accepts only the exact configured six-digit code", () => {
  assert.equal(isTouchExitCode("888888"), true);
  assert.equal(isTouchExitCode(888888), true);
  assert.equal(isTouchExitCode("88888"), false);
  assert.equal(isTouchExitCode(" 888888 "), false);
});

test("game Touch uses one pointer path and hides debug statistics by presentation", async () => {
  const source = await readFile(
    new URL("../src/views/LedGameTouchView.vue", import.meta.url),
    "utf8",
  );
  assert.match(source, /@pointerup="openExitKeypad"/);
  assert.doesNotMatch(source, /@touchstart|@touchend/);
  assert.match(source, /v-if="!isGamePresentation"\s+class="touch-live-stats"/);
  assert.match(source, /v-if="!isGamePresentation"\s+class="touch-danger-button"/);
  assert.match(source, /preparation\.value\?\.options\.launchMethod/);
  assert.match(source, /isWristbandEntry/);
  assert.match(source, /createWristbandPreparation/);
});

test("secondary renderer is read-only and restores runtime state before broadcasts", async () => {
  const source = await readFile(
    new URL("../src/views/SecondaryDisplayView.vue", import.meta.url),
    "utf8",
  );
  assert.match(source, /await api\.touchGameState\(\)/);
  assert.match(source, /api\?\.onEngineState/);
  assert.doesNotMatch(
    source,
    /stopTouchGame|stopGame|confirmPreparation|sendGameInput|nextStage|retry/,
  );
});

test("secondary window stays single-instance, targets explicit bounds, and closes on removal", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const secondaryWindowSource = source.slice(
    source.indexOf("function activateSecondaryWindow("),
    source.indexOf("function startFrameServer()"),
  );
  const displayRemovalSource = source.slice(
    source.indexOf("screen.on('display-removed'"),
    source.indexOf("app.on('activate'"),
  );

  assert.match(secondaryWindowSource, /secondaryWindowDisplayId === String\(display\.id\)/);
  assert.match(secondaryWindowSource, /activateSecondaryWindow\(secondaryWindow\)/);
  assert.match(secondaryWindowSource, /createdWindow\.setBounds\(bounds\)/);
  assert.match(secondaryWindowSource, /createdWindow\.setFullScreen\(true\)/);
  assert.match(secondaryWindowSource, /window=secondary/);
  assert.match(displayRemovalSource, /secondaryWindowDisplayId === String\(display\?\.id\)/);
  assert.match(displayRemovalSource, /detachedWindow\.close\(\)/);
  assert.doesNotMatch(displayRemovalSource, /getPrimaryDisplay|createSecondaryWindow/);
});

test("debug game entry applies the split bounds to both auxiliary windows", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const debugWindowSource = source.slice(
    source.indexOf("function createDebugWindow("),
    source.indexOf("function normalizeTouchPresentationMode("),
  );
  const enterGameFlowSource = source.slice(
    source.indexOf("async function enterGameFlow()"),
    source.indexOf("function executePreparationRequest"),
  );

  assert.match(source, /function resolveDebugGameSplitBounds\(\)/);
  assert.match(source, /screen\.getDisplayMatching\(mainWindow\.getBounds\(\)\)/);
  assert.match(debugWindowSource, /applyWindowBounds\(debugWindow, layoutBounds, \{ split: true \}\)/);
  assert.match(debugWindowSource, /resizable: !layoutBounds/);
  assert.match(enterGameFlowSource, /const splitBounds = windowPlan\.openDebugPanel \? resolveDebugGameSplitBounds\(\) : null/);
  assert.match(enterGameFlowSource, /createDebugWindow\(splitBounds\.debug\)/);
  assert.match(enterGameFlowSource, /createTouchWindow\(windowPlan\.presentationMode, splitBounds\?\.touch\)/);
});
