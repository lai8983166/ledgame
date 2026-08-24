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

test("the main game list dispatches Simple and Rank to isolated editors", async () => {
  const app = await readFile(new URL("../src/App.vue", import.meta.url), "utf8");
  const list = await readFile(new URL("../src/views/GameListView.vue", import.meta.url), "utf8");
  const editor = await readFile(new URL("../src/views/SimpleGameEditorView.vue", import.meta.url), "utf8");

  assert.match(list, /loadSupportedGames/);
  assert.match(list, /open-game/);
  assert.match(app, /@open-game="openGameEditor"/);
  assert.match(app, /game\?\.type === "rank"[\s\S]*activeView\.value = "rank-editor"/);
  assert.match(app, /game\?\.type === "default"[\s\S]*activeView\.value = "simple-editor"/);
  assert.match(app, /:game-id="selectedEditorGame\?\.id"/);
  assert.match(editor, /gameId:/);
  assert.match(editor, /api\.getGameEditor\(gameId\)/);
  assert.match(editor, /api\.saveGameEditor\(currentGameId\.value/);
  assert.doesNotMatch(editor, /seedSimpleDemo/);
});

test("Touch preparation uses the same variant list and submits the selected id", async () => {
  const source = await readFile(new URL("../src/views/LedGameTouchView.vue", import.meta.url), "utf8");

  assert.match(source, /loadSupportedGames/);
  assert.match(source, /api\.selectPreparationGame\(sessionId, game\.id\)/);
  assert.match(source, /game\.type === "rank"[\s\S]*rankTouchDocument\(game\)/);
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
