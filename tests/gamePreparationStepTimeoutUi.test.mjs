import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viewSource = readFileSync(
  new URL("../src/views/LedGameTouchView.vue", import.meta.url),
  "utf8",
);

test("Game preparation wizard renders a dedicated top-right step timeout", () => {
  assert.match(viewSource, /data-testid="game-preparation-step-timeout"/);
  assert.match(viewSource, /v-if="preparationStepTimeoutVisible"/);
  assert.match(viewSource, /preparationStepSecondsRemaining/);
  assert.match(viewSource, /\.touch-preparation-step-timeout\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:/);
});

test("Step timeout uses the existing safe return-to-idle transaction", () => {
  assert.match(viewSource, /createTouchPreparationStepTimeout/);
  assert.match(viewSource, /returnTouchRuntimeToIdle\(\{/);
  assert.match(viewSource, /preparationSessionId:\s*sessionId/);
  assert.match(viewSource, /await refreshState\(\)/);
  assert.match(viewSource, /if \(busyAction\.value\)/);
  assert.match(viewSource, /isTouchPreparationStepTimeoutCurrent/);
});
