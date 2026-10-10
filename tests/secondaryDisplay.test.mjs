import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const {
  describeDisplays,
  matchSecondaryDisplay,
  automaticSecondaryDisplay,
  secondaryWindowPlacement,
  toDisplaySelection,
} = require("../electron/secondary-display.cjs");

function display(id, label, x, width = 1920, height = 1080) {
  return {
    id,
    label,
    bounds: { x, y: 0, width, height },
    workArea: { x, y: 0, width, height: height - 40 },
    scaleFactor: 1,
  };
}

test("display descriptions expose the primary display but prevent selecting it", () => {
  const raw = [display(1, "Primary", 0), display(2, "Projector", 1920)];
  const descriptors = describeDisplays(raw, raw[0]);
  assert.equal(descriptors[0].primary, true);
  assert.equal(descriptors[0].selectable, false);
  assert.equal(toDisplaySelection(descriptors[0]), null);
  assert.deepEqual(toDisplaySelection(descriptors[1]), {
    id: "2",
    label: "Projector",
    bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
  });
});

test("secondary display matching survives an id change only for one matching fingerprint", () => {
  const initialRaw = [display(1, "Primary", 0), display(2, "Projector", 1920)];
  const initial = describeDisplays(initialRaw, initialRaw[0]);
  const selection = toDisplaySelection(initial[1]);
  const reconnectedRaw = [display(1, "Primary", 0), display(88, "Projector", 1920)];
  const reconnected = describeDisplays(reconnectedRaw, reconnectedRaw[0]);

  assert.equal(matchSecondaryDisplay(reconnected, selection)?.id, "88");

  const ambiguousRaw = [
    display(1, "Primary", 0),
    display(88, "Projector", 1920),
    display(89, "Projector", 1920),
  ];
  const ambiguous = describeDisplays(ambiguousRaw, ambiguousRaw[0]);
  assert.equal(matchSecondaryDisplay(ambiguous, selection), null);
});

test("secondary display matching never falls back to primary or an unrelated screen", () => {
  const raw = [display(1, "Primary", 0), display(3, "Lobby", 1920, 1280, 720)];
  const descriptors = describeDisplays(raw, raw[0]);
  assert.equal(
    matchSecondaryDisplay(descriptors, {
      id: "missing",
      label: "Projector",
      bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
    }),
    null,
  );
});

test("automatic secondary display prefers saved external, first external, then primary", () => {
  const raw = [display(1, "Primary", 0), display(2, "Left", -1920), display(3, "Right", 1920)];
  const descriptors = describeDisplays(raw, raw[0]);
  const saved = toDisplaySelection(descriptors[2]);
  assert.equal(automaticSecondaryDisplay(descriptors, saved).id, "3");
  assert.equal(automaticSecondaryDisplay(descriptors, null).id, "2");
  assert.equal(automaticSecondaryDisplay(descriptors.slice(0, 1), saved).id, "1");
  assert.equal(automaticSecondaryDisplay([], saved), null);
  assert.equal(toDisplaySelection(automaticSecondaryDisplay(descriptors.slice(0, 1), saved)), null);
});

test("primary fallback is centered and windowed inside the work area, external stays fullscreen", () => {
  for (const raw of [display(1, "Primary", 0), display(1, "Small", -800, 800, 600)]) {
    const [primary] = describeDisplays([raw], raw);
    const plan = secondaryWindowPlacement(primary);
    const area = primary.workArea;
    assert.equal(plan.fullScreen, false);
    assert.ok(plan.bounds.width <= 1280 && plan.bounds.height <= 720);
    assert.ok(plan.bounds.x >= area.x && plan.bounds.y >= area.y);
    assert.ok(plan.bounds.x + plan.bounds.width <= area.x + area.width);
    assert.ok(plan.bounds.y + plan.bounds.height <= area.y + area.height);
  }
  const raw = [display(1, "Primary", 0), display(2, "Left", -1920)];
  const external = describeDisplays(raw, raw[0])[1];
  assert.deepEqual(secondaryWindowPlacement(external), { bounds: external.bounds, fullScreen: true });
  assert.equal(secondaryWindowPlacement(null), null);
  assert.equal(secondaryWindowPlacement({ primary: true, bounds: { width: 0, height: 0 } }), null);
});

test("startup uses automatic secondary target selection in the shared main process", async () => {
  const source = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(source, /async function openAutomaticSecondaryDisplay\(\)/);
  assert.match(source, /void openAutomaticSecondaryDisplay\(\)\.catch/);
  assert.match(source, /automaticSecondaryDisplay\(displays, settings\.secondaryDisplay\)/);
});

test("secondary runtime view shows generic game time without treating Rank milliseconds as global time", async () => {
  const source = await readFile(new URL("../src/views/SecondaryDisplayView.vue", import.meta.url), "utf8");

  assert.match(source, /secondaryDisplay\.gameRemaining/);
  assert.match(source, /presentation\.gameTime\.visible/);
  assert.match(source, /presentation(?:\.value)?\.gameTime\.mode === "UNLIMITED"/);
  assert.match(source, /secondaryDisplay\.unlimited/);
  assert.doesNotMatch(source, /rankSecondary\.remainingTime[^\n]*gameplay\.remainingMillis/);
});

test("secondary runtime view keeps gameplay score and accumulated member points separate", async () => {
  const source = await readFile(new URL("../src/views/SecondaryDisplayView.vue", import.meta.url), "utf8");

  assert.match(source, /secondaryDisplay\.score[\s\S]*presentation\.score/);
  assert.match(source, /secondaryDisplay\.memberPoints[\s\S]*presentation\.memberPoints/);
  assert.match(source, /rankSecondary\.totalScore[\s\S]*player\.totalScore/);
  assert.match(source, /secondaryDisplay\.memberPoints[\s\S]*player\.memberPoints/);
});

test("secondary runtime reuses the animated idle display with the floor-game title", async () => {
  const source = await readFile(new URL("../src/views/SecondaryDisplayView.vue", import.meta.url), "utf8");
  const idleComponent = await readFile(new URL("../src/components/IdlePromptDisplay.vue", import.meta.url), "utf8");
  const touchSource = await readFile(new URL("../src/views/LedGameTouchView.vue", import.meta.url), "utf8");

  assert.match(source, /dashboard\/idle\.mp4/);
  assert.match(source, /data-testid="secondary-display-idle"/);
  assert.match(source, /<IdlePromptDisplay[\s\S]*:text="secondaryIdlePromptText"/);
  assert.match(source, /@error="idleMediaFailed = true"/);
  assert.match(source, /getSecondaryIdleMedia/);
  assert.match(source, /showIdleImage/);
  assert.match(source, /\["UNKNOWN", "STOPPED", "IDLE", "PREPARING"\]\.includes\(lifecycle\.value\)/);
  assert.match(source, /secondaryIdlePromptText/);
  assert.match(source, /secondaryIdlePromptFontSize/);
  assert.match(idleComponent, /touch-idle-title-depth/);
  assert.match(idleComponent, /touch-idle-prompt-fade/);
  assert.match(touchSource, /<IdlePromptDisplay/);
});
