import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("card play enters setup directly and editors no longer expose play buttons", async () => {
  const source = await readFile(new URL("../src/views/SimpleGameEditorView.vue", import.meta.url), "utf8");
  const app = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
  const startFunction = app.slice(app.indexOf('async function openGameDebug'), app.indexOf('function openGameEditor'));
  assert.match(startFunction, /api\.getGameEditor/);
  assert.match(startFunction, /api\.getRankGameEditor/);
  assert.match(startFunction, /activeView\.value = 'game-debug'/);
  assert.doesNotMatch(source, /@click="startGame"|EditorDebugEntryDialog/);
  assert.doesNotMatch(startFunction, /api\.startGame|enterGameFlow|createPreparation|saveGameEditor/);
});

test("Touch view does not create audio playback or consume legacy audio actions", async () => {
  const source = await readFile(new URL("../src/views/LedGameTouchView.vue", import.meta.url), "utf8");

  assert.doesNotMatch(source, /new\s+Audio|<audio/i);
  assert.doesNotMatch(source, /action\s*===?\s*(1|13)/);
  assert.match(source, /onEngineState/);
});

test("Touch IDLE uses the fixed muted looping video and click still creates preparation", async () => {
  const source = await readFile(new URL("../src/views/LedGameTouchView.vue", import.meta.url), "utf8");

  assert.match(source, /dashboard\/idle\.mp4/);
  assert.match(source, /<video[\s\S]*autoplay[\s\S]*loop[\s\S]*muted[\s\S]*playsinline/);
  assert.match(source, /idleVideoElement\.value\?\.play\(\)/);
  assert.match(source, /@canplay="playIdleVideo"/);
  assert.match(source, /idleAwakeRequested\.value\s*=\s*true/);
  assert.match(source, /api\.createPreparation\(\)/);
});
