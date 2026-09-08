import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  applyApplicationBrand,
  installApplicationIcon,
  toPublicApplicationSettings,
} = require("../electron/application-branding.cjs");
const { createApplicationSettingsStore } = require("../electron/application-settings.cjs");

test("public application settings never reveal the configured touch exit password", () => {
  assert.deepEqual(toPublicApplicationSettings({
    applicationTitle: "Floor Fun",
    touchExitPassword: "123456",
  }), { applicationTitle: "Floor Fun" });
});

test("application brand updates every live non-splash window and uses a managed icon", () => {
  const calls = [];
  const live = {
    isDestroyed: () => false,
    setTitle: (value) => calls.push(["title", value]),
    setIcon: (value) => calls.push(["icon", value]),
  };
  const destroyed = { isDestroyed: () => true };
  const splash = { isDestroyed: () => false };
  const appCalls = [];
  const result = applyApplicationBrand({
    app: { setName: (value) => appCalls.push(value) },
    BrowserWindow: { getAllWindows: () => [live, destroyed, splash] },
    fsSync: { existsSync: () => true },
    settings: { applicationTitle: "Floor Fun", applicationIconPath: "managed.png" },
    splashWindow: splash,
  });
  assert.deepEqual(appCalls, ["Floor Fun"]);
  assert.deepEqual(calls, [["title", "Floor Fun"], ["icon", "managed.png"]]);
  assert.deepEqual(result, { title: "Floor Fun", iconAvailable: true });
});

test("invalid icon copy leaves the previous persisted icon unchanged and cleans its temp file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "led-game-branding-"));
  const settingsPath = path.join(directory, "application.json");
  const source = path.join(directory, "new.png");
  const previous = path.join(directory, "previous.png");
  try {
    await writeFile(source, "image", "utf8");
    const store = createApplicationSettingsStore({ fs, settingsPath });
    await store.update({ applicationIconPath: previous });
    const removed = [];
    await assert.rejects(() => installApplicationIcon({
      fs: {
        stat: fs.stat,
        mkdir: fs.mkdir,
        copyFile: async () => { throw new Error("copy failed"); },
        rename: fs.rename,
        rm: async (file) => { removed.push(file); },
      },
      nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
      source,
      userDataPath: directory,
      now: () => 7,
    }), /copy failed/);
    assert.equal((await store.get()).applicationIconPath, path.resolve(previous));
    assert.deepEqual(removed, [path.join(directory, "branding", "application-icon-7.png.tmp")]);
    assert.equal(JSON.parse(await readFile(settingsPath, "utf8")).applicationIconPath, path.resolve(previous));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
