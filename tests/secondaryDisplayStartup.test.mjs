import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import path from 'node:path';

const require = createRequire(import.meta.url);
const helpers = require('../electron/secondary-display.cjs');
const source = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const primary = { id: 1, label: 'Primary', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const external = { id: 2, label: 'External', bounds: { x: -1920, y: 0, width: 1920, height: 1080 } };

function harness({ displays = [primary], selection = null, dev = false } = {}) {
  const windows = [];
  const writes = [];
  const displayEvents = {};
  const settings = { secondaryDisplay: selection };
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.send = () => {};
      this.webContents.focus = () => {};
      windows.push(this);
    }
    isDestroyed() { return Boolean(this.destroyed); }
    isMinimized() { return false; }
    isVisible() { return Boolean(this.visible); }
    setMenuBarVisibility() {}
    show() { this.visible = true; }
    moveTop() {}
    focus() {}
    setBounds(bounds) { this.bounds = bounds; }
    setFullScreen(value) { this.fullScreen = value; }
    loadURL(url) { this.url = url; }
    loadFile(file, options) { this.file = file; this.query = options.query; }
    close() { this.destroyed = true; this.emit('closed'); }
  }
  const context = vm.createContext({
    ...helpers, BrowserWindow: Window, path, __dirname: 'electron', isDev: dev,
    process: { env: { VITE_DEV_SERVER_URL: 'http://localhost:5173' } },
    screen: { getAllDisplays: () => displays, getPrimaryDisplay: () => primary, on: (name, fn) => { displayEvents[name] = fn; } },
    applicationSettings: { get: async () => settings },
    updateApplicationSettings: async (patch) => { writes.push(patch); Object.assign(settings, patch); },
    preventRendererTitleOverride: () => {},
  });
  vm.runInContext(`let secondaryWindow = null; let secondaryWindowDisplayId = null; let latestEngineState = null;\n` +
    source.slice(source.indexOf('function currentDisplayDescriptors()'), source.indexOf('async function broadcastSecondaryDisplayStatus')) +
    '\nasync function broadcastSecondaryDisplayStatus() { return getSecondaryDisplayState(); }\n' +
    source.slice(source.indexOf('function activateSecondaryWindow('), source.indexOf('function startFrameServer()')), context);
  vm.runInContext(source.slice(source.indexOf("screen.on('display-added'"),source.indexOf("screen.on('display-metrics-changed'")),context);
  return { context, windows, writes, settings, displays, displayEvents };
}

for (const dev of [true, false]) {
  test(`single-monitor manual opening and reopening use one fullscreen window (${dev ? 'dev' : 'packaged'})`, async () => {
    const h = harness({ dev, selection: helpers.toDisplaySelection(helpers.describeDisplays([primary, external], primary)[1]) });
    assert.equal(h.windows.length, 0);
    const state = await h.context.openSecondaryDisplay();
    assert.equal(state.activeDisplayId, '1');
    assert.equal(state.selectedAvailable, true);
    assert.equal(h.writes.length, 0, 'primary fallback must preserve saved external choice');
    const first = h.windows[0];
    first.emit('ready-to-show');
    assert.equal(first.fullScreen, true);
    assert.equal(first.visible, true);
    assert.equal(first.options.useContentSize, false);
    if (dev) assert.equal(first.url, 'http://localhost:5173?window=secondary');
    else assert.equal(first.query.window, 'secondary');
    await h.context.openSecondaryDisplay();
    assert.equal(h.windows.length, 1);
    first.close();
    assert.equal((await h.context.getSecondaryDisplayState()).windowOpen, false);
    assert.equal((await h.context.getSecondaryDisplayState()).selectedAvailable, true);
    await h.context.openSecondaryDisplay();
    assert.equal(h.windows.length, 2);
    assert.equal((await h.context.getSecondaryDisplayState()).activeDisplayId, '1');
  });
}

test('external attachment does not open or move a window until manually opened', async () => {
  const h = harness();
  await h.context.openSecondaryDisplay();
  h.displays.push(external);
  h.displayEvents['display-added']();
  assert.equal(h.windows.length,1);
  assert.notEqual(h.windows[0].destroyed,true);
  const state = await h.context.openSecondaryDisplay();
  assert.equal(h.windows[0].destroyed, true);
  assert.equal(state.activeDisplayId, '2');
  const second = h.windows[1];
  second.emit('ready-to-show');
  assert.equal(second.fullScreen, true);
  assert.deepEqual(second.bounds, external.bounds);
  assert.equal(h.settings.secondaryDisplay, null);
  await h.context.openSecondaryDisplay();
  assert.equal(h.windows.length, 2);
  assert.doesNotMatch(source, /openAutomaticSecondaryDisplay/);
});
