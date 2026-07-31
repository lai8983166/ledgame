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

test("application settings normalize missing and unsupported fields to safe defaults", () => {
  assert.deepEqual(normalizeApplicationSettings(null), {
    entryMethod: "touch",
    mode: "debug",
    secondaryDisplay: null,
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
      secondaryDisplay: null,
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
    });
    assert.equal(saved.entryMethod, "wristband");
    assert.equal(saved.mode, "game");
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
      secondaryDisplay: null,
    });
    await assert.rejects(() => store.update({ mode: "operator" }), /Unsupported application mode/);
    await assert.rejects(
      () => store.update({ entryMethod: "card" }),
      /Unsupported entry method/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
