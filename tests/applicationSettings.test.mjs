import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createApplicationSettingsStore,
  normalizeApplicationSettings,
} = require("../electron/application-settings.cjs");

const DEFAULT_PROMPT_TEXTS = {
  "zh-CN": "开始游戏",
  "en-US": "Start Game",
  "es-ES": "Iniciar juego",
  "pt-PT": "Iniciar jogo",
  "fr-FR": "Démarrer le jeu",
  "de-DE": "Spiel starten",
  "pl-PL": "Rozpocznij grę",
  "ru-RU": "Начать игру",
  "vi-VN": "Bắt đầu trò chơi",
  "it-IT": "Avvia gioco",
  "cs-CZ": "Spustit hru",
  "ko-KR": "게임 시작",
  "ro-RO": "Pornește jocul",
  "ar-SA": "ابدأ اللعبة",
};
const BRAND_DEFAULTS = { applicationTitle: "LED Game", applicationIconPath: null, touchExitPassword: "888888" };

test("application settings normalize missing and unsupported fields to safe defaults", () => {
  assert.deepEqual(normalizeApplicationSettings(null), {
    entryMethod: "touch",
    mode: "debug",
    memberPlatformHost: "127.0.0.1",
    memberPlatformPort: 8090,
    secondaryDisplay: null,
    touchIdlePromptTexts: DEFAULT_PROMPT_TEXTS,
    touchIdlePromptFontSize: 72,
    ...BRAND_DEFAULTS,
  });
  assert.deepEqual(
    normalizeApplicationSettings({
      entryMethod: "unsupported",
      mode: "game",
      secondaryDisplay: { id: "", bounds: {} },
    }),
    {
      entryMethod: "touch",
      mode: "game",
      memberPlatformHost: "127.0.0.1",
      memberPlatformPort: 8090,
      secondaryDisplay: null,
      touchIdlePromptTexts: DEFAULT_PROMPT_TEXTS,
      touchIdlePromptFontSize: 72,
      ...BRAND_DEFAULTS,
    },
  );
});

test("application settings persist valid values atomically and restore across instances", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "led-game-settings-"));
  const settingsPath = path.join(directory, "settings", "application.json");
  try {
    const store = createApplicationSettingsStore({ fs, settingsPath });
    const saved = await store.update({
      entryMethod: "wristband",
      mode: "game",
      secondaryDisplay: {
        id: "display-2",
        label: "Hall Screen",
        bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
      },
      touchIdlePromptTexts: {
        ...DEFAULT_PROMPT_TEXTS,
        "zh-CN": "准备开始",
        "en-US": "Get Ready",
      },
      touchIdlePromptFontSize: 96,
    });
    assert.equal(saved.entryMethod, "wristband");
    assert.equal(saved.mode, "game");
    assert.equal(saved.touchIdlePromptTexts["zh-CN"], "准备开始");
    assert.equal(saved.touchIdlePromptTexts["en-US"], "Get Ready");
    assert.equal(saved.touchIdlePromptFontSize, 96);
    assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), saved);
    assert.deepEqual(
      await createApplicationSettingsStore({ fs, settingsPath }).get(),
      saved,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("application settings reject invalid writes and recover damaged JSON", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "led-game-settings-"));
  const settingsPath = path.join(directory, "application.json");
  try {
    await writeFile(settingsPath, "not-json", "utf8");
    const store = createApplicationSettingsStore({ fs, settingsPath });
    assert.deepEqual(await store.get(), {
      entryMethod: "touch",
      mode: "debug",
      memberPlatformHost: "127.0.0.1",
      memberPlatformPort: 8090,
      secondaryDisplay: null,
      touchIdlePromptTexts: DEFAULT_PROMPT_TEXTS,
      touchIdlePromptFontSize: 72,
      ...BRAND_DEFAULTS,
    });
    await assert.rejects(() => store.update({ mode: "operator" }), /Unsupported application mode/);
    await assert.rejects(
      () => store.update({ entryMethod: "card" }),
      /Unsupported entry method/,
    );
    await assert.rejects(
      () => store.update({ touchIdlePromptTexts: { "zh-CN": "   " } }),
      /must not be blank/,
    );
    await assert.rejects(
      () => store.update({ touchIdlePromptTexts: { "zh-CN": "字".repeat(49) } }),
      /at most 48/,
    );
    const maximumFontSize = await store.update({ touchIdlePromptFontSize: 200 });
    assert.equal(maximumFontSize.touchIdlePromptFontSize, 200);
    await assert.rejects(
      () => store.update({ touchIdlePromptFontSize: 201 }),
      /between 32 and 200/,
    );
    await assert.rejects(
      () => store.update({ memberPlatformHost: "http://bad-host" }),
      /member platform host/i,
    );
    await assert.rejects(
      () => store.update({ memberPlatformPort: 70000 }),
      /member platform port/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("application settings migrate the legacy single idle prompt into localized defaults", () => {
  const normalized = normalizeApplicationSettings({ touchIdlePromptText: "自定义开始" });
  assert.equal(normalized.touchIdlePromptTexts["zh-CN"], "自定义开始");
  assert.equal(normalized.touchIdlePromptTexts["en-US"], "Start Game");
});

test("application title, managed icon and touch exit password persist with safe validation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "led-game-brand-settings-"));
  const settingsPath = path.join(directory, "application.json");
  try {
    const store = createApplicationSettingsStore({ fs, settingsPath });
    const iconPath = path.join(directory, "brand icon.png");
    const saved = await store.update({
      applicationTitle: "  Fun Floor  ",
      applicationIconPath: iconPath,
      touchExitPassword: "123456",
    });
    assert.equal(saved.applicationTitle, "Fun Floor");
    assert.equal(saved.applicationIconPath, path.resolve(iconPath));
    assert.equal(saved.touchExitPassword, "123456");
    assert.deepEqual(await createApplicationSettingsStore({ fs, settingsPath }).get(), saved);

    await assert.rejects(() => store.update({ applicationTitle: "   " }), /1 to 64/);
    await assert.rejects(() => store.update({ applicationTitle: "x".repeat(65) }), /1 to 64/);
    await assert.rejects(() => store.update({ touchExitPassword: "12ab" }), /4 to 12 digits/);
    await assert.rejects(() => store.update({ touchExitPassword: "1".repeat(13) }), /4 to 12 digits/);
    assert.deepEqual(await store.get(), saved);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
