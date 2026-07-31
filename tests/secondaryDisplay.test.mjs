import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  describeDisplays,
  matchSecondaryDisplay,
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
