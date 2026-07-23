import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  isManagedDatabaseFile,
  refreshDatabaseFiles,
} from "../electron/database-refresh.cjs";

async function createDatabaseFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "led-game-database-refresh-"));
  const userDir = path.join(root, "user", "runtime");
  const seedDir = path.join(root, "seed", "runtime");
  const backupRoot = path.join(root, "backups");
  await fs.mkdir(userDir, { recursive: true });
  await fs.mkdir(seedDir, { recursive: true });
  return { root, userDir, seedDir, backupRoot };
}

test("database file filter excludes H2 lock and temporary files", () => {
  assert.equal(isManagedDatabaseFile("ledgame.mv.db"), true);
  assert.equal(isManagedDatabaseFile("ledgame.trace.db"), true);
  assert.equal(isManagedDatabaseFile("ledgame.lock.db"), false);
  assert.equal(isManagedDatabaseFile("ledgame.mv.db.temp"), false);
});

test("full refresh backs up current files and replaces only managed H2 files", async () => {
  const fixture = await createDatabaseFixture();
  try {
    await fs.writeFile(path.join(fixture.userDir, "ledgame.mv.db"), "old-db");
    await fs.writeFile(path.join(fixture.userDir, "ledgame.trace.db"), "old-trace");
    await fs.writeFile(path.join(fixture.userDir, "ledgame.lock.db"), "runtime-lock");
    await fs.writeFile(path.join(fixture.seedDir, "ledgame.mv.db"), "new-db");

    const result = await refreshDatabaseFiles({
      userDatabaseRuntimeDir: fixture.userDir,
      seedDatabaseRuntimeDir: fixture.seedDir,
      backupRoot: fixture.backupRoot,
      now: new Date("2026-07-23T12:34:56"),
    });

    assert.equal(await fs.readFile(path.join(fixture.userDir, "ledgame.mv.db"), "utf8"), "new-db");
    assert.equal(await fs.stat(path.join(fixture.userDir, "ledgame.lock.db")).then(() => true), true);
    assert.equal(await fs.stat(path.join(fixture.userDir, "ledgame.trace.db")).then(() => false).catch(() => false), false);
    assert.equal(
      await fs.readFile(path.join(result.backupDirectory, "ledgame.mv.db"), "utf8"),
      "old-db",
    );
    assert.equal(
      await fs.readFile(path.join(result.backupDirectory, "ledgame.trace.db"), "utf8"),
      "old-trace",
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("missing seed database leaves the current database untouched", async () => {
  const fixture = await createDatabaseFixture();
  try {
    const currentPath = path.join(fixture.userDir, "ledgame.mv.db");
    await fs.writeFile(currentPath, "old-db");

    await assert.rejects(
      refreshDatabaseFiles({
        userDatabaseRuntimeDir: fixture.userDir,
        seedDatabaseRuntimeDir: fixture.seedDir,
        backupRoot: fixture.backupRoot,
      }),
      (error) => error.code === "SEED_DATABASE_MISSING",
    );
    assert.equal(await fs.readFile(currentPath, "utf8"), "old-db");
    await assert.rejects(fs.stat(fixture.backupRoot), (error) => error.code === "ENOENT");
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("replacement failure restores the backed-up database", async () => {
  const fixture = await createDatabaseFixture();
  try {
    const currentPath = path.join(fixture.userDir, "ledgame.mv.db");
    await fs.writeFile(currentPath, "old-db");
    await fs.writeFile(path.join(fixture.seedDir, "ledgame.mv.db"), "new-db");

    let replacementCopyFailed = false;
    const testFs = {
      ...fs,
      copyFile: async (source, destination, ...rest) => {
        if (!replacementCopyFailed && destination === currentPath && source.includes(".database-refresh-")) {
          replacementCopyFailed = true;
          throw new Error("simulated replacement failure");
        }
        return fs.copyFile(source, destination, ...rest);
      },
    };

    await assert.rejects(
      refreshDatabaseFiles({
        userDatabaseRuntimeDir: fixture.userDir,
        seedDatabaseRuntimeDir: fixture.seedDir,
        backupRoot: fixture.backupRoot,
        fs: testFs,
      }),
      (error) => error.code === "REPLACE_FAILED" && Boolean(error.backupDirectory),
    );
    assert.equal(await fs.readFile(currentPath, "utf8"), "old-db");
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("Electron exposes an embedded-only refresh IPC flow and Help entry", async () => {
  const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const preloadSource = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/App.vue", import.meta.url), "utf8");
  const viewSource = await readFile(new URL("../src/views/DatabaseRefreshView.vue", import.meta.url), "utf8");

  assert.match(mainSource, /ipcMain\.handle\(['"]database:refresh-availability['"]/);
  assert.match(mainSource, /ipcMain\.handle\(['"]database:refresh['"]/);
  assert.match(mainSource, /UNSUPPORTED_RUNTIME_MODE/);
  assert.match(mainSource, /await stopEmbeddedBackendAndWait\(\)/);
  assert.match(mainSource, /refreshDatabaseFiles\(\{/);
  assert.match(preloadSource, /databaseRefreshAvailability/);
  assert.match(preloadSource, /refreshDatabase: \(\) => ipcRenderer\.invoke\(['"]database:refresh['"]\)/);
  assert.match(appSource, /t\("nav\.dataUpdate"\)/);
  assert.match(appSource, /activeView === 'database-refresh'/);
  assert.match(viewSource, /window\.confirm\(t\("databaseRefresh\.confirm"\)\)/);
  assert.match(viewSource, /window\.location\.reload\(\)/);
});
