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
const BRAND_DEFAULTS = {
  secondaryIdleSubtitleFontSize: 72,
  touchPreparationTimeoutSeconds: 20,
  coinCount: 1,
  secondaryIdleSubtitleText: '',
  applicationTitle: "LED Game",
  applicationIconPath: null,
  secondaryDisplayBackgroundPath: null,
  secondaryIdleMediaPath: null,
  touchExitPassword: "888888",
  secondaryIdlePromptText: "LED FLOOR GAME",
  secondaryIdlePromptFontSize: 72,
};

test('legacy global debug settings normalize to game without changing connection or entry method', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'led-game-old-mode-'));
  try {
    const settingsPath = path.join(directory, 'application.json');
    await writeFile(settingsPath, JSON.stringify({mode:'debug',entryMethod:'wristband',memberPlatformPort:18090}));
    const store = createApplicationSettingsStore({fs,settingsPath});
    const current = await store.get();
    assert.equal(current.mode,'game');
    assert.equal(current.entryMethod,'wristband');
    assert.equal(current.memberPlatformPort,18090);
    await store.update({applicationTitle:'Changed'});
    assert.equal(JSON.parse(await readFile(settingsPath,'utf8')).mode,'game');
    assert.equal((await store.update({mode:'debug'})).mode,'game');
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test("application settings normalize missing and unsupported fields to safe defaults", () => {
  assert.deepEqual(normalizeApplicationSettings(null), {
    entryMethod: "touch",
    mode: "game",
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
      secondaryIdlePromptText: "  FLOOR READY  ",
      secondaryIdlePromptFontSize: 96,
    });
    assert.equal(saved.entryMethod, "wristband");
    assert.equal(saved.mode, "game");
    assert.equal(saved.touchIdlePromptTexts["zh-CN"], "准备开始");
    assert.equal(saved.touchIdlePromptTexts["en-US"], "Get Ready");
    assert.equal(saved.touchIdlePromptFontSize, 96);
    assert.equal(saved.secondaryIdlePromptText, "FLOOR READY");
    assert.equal(saved.secondaryIdlePromptFontSize, 96);
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
      mode: "game",
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
      () => store.update({ secondaryIdlePromptText: "   " }),
      /Secondary idle prompt text/,
    );
    await assert.rejects(
      () => store.update({ secondaryIdlePromptText: "x".repeat(65) }),
      /Secondary idle prompt text/,
    );
    await assert.rejects(
      () => store.update({ secondaryIdlePromptFontSize: 201 }),
      /Secondary idle prompt font size/,
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

test('old subtitle sizes inherit the saved top title; independent sizes and preparation timeout survive restart', async () => {
  assert.equal(normalizeApplicationSettings({ secondaryIdlePromptFontSize: 96 }).secondaryIdleSubtitleFontSize, 96);
  assert.equal(normalizeApplicationSettings({ touchPreparationTimeoutSeconds: 0 }).touchPreparationTimeoutSeconds, 20);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'led-game-title-sizes-'));
  try {
    const settingsPath = path.join(directory, 'application.json');
    await writeFile(settingsPath, JSON.stringify({ secondaryIdlePromptFontSize: 96 }));
    const store = createApplicationSettingsStore({ fs, settingsPath });
    assert.equal((await store.get()).secondaryIdleSubtitleFontSize, 96);
    const saved = await store.update({ secondaryIdlePromptFontSize: 120, secondaryIdleSubtitleFontSize: 48, touchPreparationTimeoutSeconds: 3600 });
    const reopened = await createApplicationSettingsStore({ fs, settingsPath }).get();
    assert.equal(reopened.secondaryIdlePromptFontSize, 120);
    assert.equal(reopened.secondaryIdleSubtitleFontSize, 48);
    assert.equal(reopened.touchPreparationTimeoutSeconds, 3600);
    for (const touchPreparationTimeoutSeconds of [0, -1, 1.5, 3601, '20']) await assert.rejects(() => store.update({ touchPreparationTimeoutSeconds }), /between 1 and 3600/);
    for (const secondaryIdleSubtitleFontSize of [31, 200.5, 201, '72']) await assert.rejects(() => store.update({ secondaryIdleSubtitleFontSize }), /subtitle font size/);
    assert.deepEqual(await store.get(), saved);
    assert.equal((await store.update({ touchPreparationTimeoutSeconds: 1 })).touchPreparationTimeoutSeconds, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('secondary subtitle and placeholder coin count persist independently of Touch',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'led-game-subtitle-'));
  try {
    const settingsPath=path.join(directory,'application.json'),store=createApplicationSettingsStore({fs,settingsPath});
    const before=await store.get();
    await store.update({secondaryIdlePromptText:'UPPER',secondaryIdleSubtitleText:' LOWER ',entryMethod:'coin',coinCount:3});
    const saved=await createApplicationSettingsStore({fs,settingsPath}).get();
    assert.equal(saved.secondaryIdleSubtitleText,'LOWER');assert.equal(saved.coinCount,3);
    assert.deepEqual(saved.touchIdlePromptTexts,before.touchIdlePromptTexts);
    await store.update({secondaryIdleSubtitleText:''});
    for(const coinCount of [0,-1,1.5,1000,'2'])await assert.rejects(()=>store.update({coinCount}),/Coin count/);
    await assert.rejects(()=>store.update({secondaryIdleSubtitleText:'x'.repeat(65)}),/subtitle/);
  }finally{await rm(directory,{recursive:true,force:true});}
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
      secondaryDisplayBackgroundPath: path.join(directory, "branding", "secondary-display-background.png"),
      secondaryIdleMediaPath: path.join(directory, "branding", "secondary-idle-media-1.mp4"),
      touchExitPassword: "123456",
    });
    assert.equal(saved.applicationTitle, "Fun Floor");
    assert.equal(saved.applicationIconPath, path.resolve(iconPath));
    assert.equal(
      saved.secondaryDisplayBackgroundPath,
      path.resolve(directory, "branding", "secondary-display-background.png"),
    );
    assert.equal(
      saved.secondaryIdleMediaPath,
      path.resolve(directory, "branding", "secondary-idle-media-1.mp4"),
    );
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
