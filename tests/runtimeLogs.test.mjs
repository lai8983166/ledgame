import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  appendBoundedLogSync,
  createBoundedLogSink,
  resolveRuntimeLogOptions,
} = require("../electron/runtime-logs.cjs");

test("runtime log options apply bounded defaults and environment overrides", () => {
  const defaults = resolveRuntimeLogOptions({});
  assert.equal(defaults.startupMaxBytes, 2 * 1024 * 1024);
  assert.equal(defaults.startupHistory, 2);
  assert.equal(defaults.backendMaxBytes, 10 * 1024 * 1024);
  assert.equal(defaults.backendHistory, 3);

  const overridden = resolveRuntimeLogOptions({
    LED_STARTUP_LOG_MAX_BYTES: "4096",
    LED_STARTUP_LOG_HISTORY: "1",
    LED_BACKEND_LOG_MAX_BYTES: "8192",
    LED_BACKEND_LOG_HISTORY: "4",
  });
  assert.deepEqual(overridden, {
    startupMaxBytes: 4096,
    startupHistory: 1,
    backendMaxBytes: 8192,
    backendHistory: 4,
  });
});

test("startup log rotates before append and drops history beyond the limit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "led-startup-log-"));
  const file = join(dir, "startup.log");
  try {
    await writeFile(file, "12345678");
    appendBoundedLogSync(file, "ABCD", { maxBytes: 10, history: 2 });
    assert.equal(await readFile(file, "utf8"), "ABCD");
    assert.equal(await readFile(`${file}.1`, "utf8"), "12345678");

    appendBoundedLogSync(file, "EFGHIJK", { maxBytes: 10, history: 2 });
    appendBoundedLogSync(file, "LMNOPQR", { maxBytes: 10, history: 2 });
    const names = (await readdir(dir)).sort();
    assert.deepEqual(names, ["startup.log", "startup.log.1", "startup.log.2"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("backend sink merges writes, rotates during one run, and closes cleanly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "led-backend-log-"));
  const file = join(dir, "backend.log");
  try {
    const sink = await createBoundedLogSink(file, { maxBytes: 12, history: 2 });
    sink.write("stdout-1\n");
    sink.write("stderr-2\n");
    sink.write("stdout-3\n");
    await sink.close();

    const names = (await readdir(dir)).sort();
    assert.deepEqual(names, ["backend.log", "backend.log.1", "backend.log.2"]);
    assert.ok((await readFile(file)).length <= 12);
    assert.ok((await readFile(`${file}.1`)).length <= 12);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("log write failures are reported without throwing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "led-log-failure-"));
  const warnings = [];
  try {
    appendBoundedLogSync(dir, "cannot append to directory", {
      maxBytes: 1024,
      history: 1,
      onWarning: (error) => warnings.push(error),
    });
    assert.equal(warnings.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("backend sink degrades to warnings when its target cannot be appended", async () => {
  const dir = await mkdtemp(join(tmpdir(), "led-log-sink-failure-"));
  const warnings = [];
  try {
    const sink = await createBoundedLogSink(dir, {
      maxBytes: 1024,
      history: 1,
      onWarning: (error) => warnings.push(error),
    });
    sink.write("backend output\n");
    await sink.close();
    assert.equal(warnings.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
