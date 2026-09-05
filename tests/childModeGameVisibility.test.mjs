import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("game selection reloads the playable catalog when child mode changes", async () => {
  const source = await readFile(new URL("../src/views/LedGameTouchView.vue", import.meta.url), "utf8");
  assert.match(source, /runtimeState\.value\.childMode/);
  assert.match(source, /await loadGames\(\)/);
  assert.match(source, /!games\.value\.some[\s\S]*await cancelPreparation\(\)/);
});
