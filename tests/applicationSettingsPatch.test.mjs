import assert from "node:assert/strict";
import test from "node:test";
import { createApplicationSettingsPatch } from "../src/lib/applicationSettingsPatch.js";

test('ordinary settings patches cannot restore global debug mode', () => {
  assert.equal(createApplicationSettingsPatch({mode:'debug'}).mode,'game');
  assert.equal(createApplicationSettingsPatch({}).mode,'game');
});

test("application settings IPC patch detaches nested reactive proxies", () => {
  const promptTexts = new Proxy({
    "zh-CN": "开始游戏",
    "en-US": "Start Game",
  }, {});
  const draft = new Proxy({
    entryMethod: "touch",
    mode: "game",
    touchIdlePromptTexts: promptTexts,
    touchIdlePromptFontSize: 72,
  }, {});

  assert.throws(
    () => structuredClone({ touchIdlePromptTexts: draft.touchIdlePromptTexts }),
    { name: "DataCloneError" },
  );

  const patch = createApplicationSettingsPatch(draft);
  assert.deepEqual(structuredClone(patch), {
    entryMethod: "touch",
    mode: "game",
    touchIdlePromptTexts: {
      "zh-CN": "开始游戏",
      "en-US": "Start Game",
    },
    touchIdlePromptFontSize: 72,
  });
});

test("application settings IPC patch includes the managed secondary background path", () => {
  const patch = createApplicationSettingsPatch({
    entryMethod: "touch",
    mode: "game",
    touchIdlePromptTexts: {},
    touchIdlePromptFontSize: 72,
    secondaryIdlePromptText: "FLOOR READY",
    secondaryIdleSubtitleText: "LET'S PLAY",
    coinCount: 2,
    secondaryIdlePromptFontSize: 96,
    secondaryIdleSubtitleFontSize: 48,
    touchPreparationTimeoutSeconds: 45,
    secondaryDisplayBackgroundPath: "C:\\data\\secondary-display-background.png",
    secondaryIdleMediaPath: "C:\\data\\secondary-idle-media-1.mp4",
  });
  assert.equal(patch.secondaryDisplayBackgroundPath, "C:\\data\\secondary-display-background.png");
  assert.equal(patch.secondaryIdlePromptText, "FLOOR READY");
  assert.equal(patch.secondaryIdleSubtitleText, "LET'S PLAY");assert.equal(patch.coinCount,2);
  assert.equal(patch.secondaryIdlePromptFontSize, 96);
  assert.equal(patch.secondaryIdleSubtitleFontSize, 48);
  assert.equal(patch.touchPreparationTimeoutSeconds, 45);
  assert.equal(patch.secondaryIdleMediaPath, "C:\\data\\secondary-idle-media-1.mp4");
});
