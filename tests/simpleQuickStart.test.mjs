import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Simple editor quick start enters setup without immediately starting or opening other windows", async () => {
  const source = await readFile(new URL("../src/views/SimpleGameEditorView.vue", import.meta.url), "utf8");
  const startFunction = source.slice(
    source.indexOf("async function startGame()"),
    source.indexOf("function openPreview()"),
  );

  assert.match(startFunction, /debugEntryOpen\.value = true/);
  assert.match(startFunction, /enterDebug\('saved'\)/);
  assert.match(source, /:start-level-index="activeLevelIndex"/);
  assert.doesNotMatch(startFunction, /api\.startGame|enterGameFlow/);
  assert.doesNotMatch(startFunction, /saveGameEditor/);
  assert.doesNotMatch(startFunction, /createPreparation/);
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
