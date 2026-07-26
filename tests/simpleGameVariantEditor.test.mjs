import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Electron exposes the Simple variant seed endpoint", async () => {
  const preload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const main = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");

  assert.match(preload, /seedSimpleVariants:.*dev:seed-simple-variants/);
  assert.match(main, /dev:seed-simple-variants/);
  assert.match(main, /\/dev\/seed\/simple-variants/);
});

test("the main game list and editor pass the selected game context", async () => {
  const app = await readFile(new URL("../src/App.vue", import.meta.url), "utf8");
  const list = await readFile(new URL("../src/views/GameListView.vue", import.meta.url), "utf8");
  const editor = await readFile(new URL("../src/views/SimpleGameEditorView.vue", import.meta.url), "utf8");

  assert.match(list, /loadSimpleGameVariants/);
  assert.match(list, /open-game/);
  assert.match(app, /@open-game="openSimpleEditor"/);
  assert.match(app, /:game-id="selectedEditorGame\?\.id"/);
  assert.match(editor, /gameId:/);
  assert.match(editor, /api\.getGameEditor\(gameId\)/);
  assert.match(editor, /api\.saveGameEditor\(currentGameId\.value/);
  assert.doesNotMatch(editor, /seedSimpleDemo/);
});

test("Touch preparation uses the same variant list and submits the selected id", async () => {
  const source = await readFile(new URL("../src/views/LedGameTouchView.vue", import.meta.url), "utf8");

  assert.match(source, /loadSimpleGameVariants/);
  assert.match(source, /api\.selectPreparationGame\(sessionId, game\.id\)/);
  assert.match(source, /game\.name === 'simple-demo'/);
});

test("Simple editor exposes per-level time and life limit controls", async () => {
  const source = await readFile(new URL("../src/views/SimpleGameEditorView.vue", import.meta.url), "utf8");

  assert.match(source, /levelTimeLimit/);
  assert.match(source, /CYCLE_COUNT/);
  assert.match(source, /CYCLE_SECONDS/);
  assert.match(source, /lifeLimitMode/);
  assert.match(source, /normalizeLevelOption/);
  assert.match(source, /validateLevelOption/);
});
