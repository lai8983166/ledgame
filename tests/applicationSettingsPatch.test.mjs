import assert from "node:assert/strict";
import test from "node:test";
import { createApplicationSettingsPatch } from "../src/lib/applicationSettingsPatch.js";

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
