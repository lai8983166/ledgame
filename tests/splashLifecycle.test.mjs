import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createSplashLifecycle } = require("../electron/splash-lifecycle.cjs");

function fixture() {
  const windows = [];
  const timers = [];
  const cleared = [];
  const watchdog = [];
  const lifecycle = createSplashLifecycle({
    createWindow: () => {
      const window = { destroyed: false, isDestroyed() { return this.destroyed; }, destroy() { this.destroyed = true; } };
      windows.push(window);
      return window;
    },
    setTimeoutFn: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeoutFn: (timer) => cleared.push(timer),
    onWatchdog: () => watchdog.push("closed"),
  });
  return { lifecycle, windows, timers, cleared, watchdog };
}

test("splash closes on normal main-window readiness", () => {
  const state = fixture();
  assert.equal(state.lifecycle.open(), state.windows[0]);
  assert.equal(state.windows[0].destroyed, false);
  state.lifecycle.close("main-ready");
  assert.equal(state.windows[0].destroyed, true);
  assert.equal(state.lifecycle.getWindow(), null);
  assert.deepEqual(state.cleared, [state.timers[0]]);
});

test("splash closes on startup failure", () => {
  const state = fixture();
  state.lifecycle.open();
  state.lifecycle.close("startup-failure");
  assert.equal(state.windows[0].destroyed, true);
});

test("splash watchdog cannot leave loading visible forever", () => {
  const state = fixture();
  state.lifecycle.open();
  assert.equal(state.timers[0].delay, 45_000);
  state.timers[0].callback();
  assert.equal(state.windows[0].destroyed, true);
  assert.deepEqual(state.watchdog, ["closed"]);
});
