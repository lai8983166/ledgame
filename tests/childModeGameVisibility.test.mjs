import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("game selection reloads the playable catalog after a successful visibility notification", async () => {
  const source = await readFile(new URL("../src/views/LedGameTouchView.vue", import.meta.url), "utf8");
  assert.match(source, /onCatalogChanged/);
  assert.doesNotMatch(source, /runtimeState\.value\.childMode/);
  assert.match(source, /if \(!refreshed \|\| !touchMounted\) return/);
  assert.match(source, /removeCatalogListener\?\.\(\)/);
  assert.match(source, /await loadGames\(\)/);
  assert.match(source, /!games\.value\.some[\s\S]*await cancelPreparation\(\)/);
});
