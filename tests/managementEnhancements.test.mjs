import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
const brandingSource = await readFile(new URL("../electron/application-branding.cjs", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.vue", import.meta.url), "utf8");
const gameListSource = await readFile(new URL("../src/views/GameListView.vue", import.meta.url), "utf8");
const applicationSettingsSource = await readFile(new URL("../src/views/ApplicationSettingsView.vue", import.meta.url), "utf8");
const secondaryDisplaySource = await readFile(new URL("../src/views/SecondaryDisplayView.vue", import.meta.url), "utf8");
const spiritSource = await readFile(new URL("../src/views/SpiritLibraryView.vue", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/style.css", import.meta.url), "utf8");
const builder = JSON.parse(await readFile(new URL("../electron-builder.json", import.meta.url), "utf8"));

test("splash owns startup visibility and is cleaned up on ready and startup failure", () => {
  assert.match(mainSource, /createSplashWindow\(\)[\s\S]*await startEmbeddedBackend\(\)[\s\S]*createWindow\(\)/);
  assert.match(mainSource, /show: false,[\s\S]*mainWindow\.once\('ready-to-show'[\s\S]*mainWindow\.show\(\)[\s\S]*splashLifecycle\.close\('main-ready'\)/);
  assert.match(mainSource, /Application startup failed[\s\S]*splashLifecycle\.close\('startup-failure'\)[\s\S]*app\.quit\(\)/);
});

test("help documents use a fixed key whitelist and are packaged as resources", () => {
  assert.match(mainSource, /const files = \{ changelog: ['"]版本变更记录\.txt['"], about: ['"]软件介绍\.txt['"] \}/);
  assert.match(mainSource, /if \(!files\[key\]\) throw new Error/);
  assert.match(preloadSource, /readHelpDocument: \(key\) => ipcRenderer\.invoke\('help:document', key\)/);
  assert.match(appSource, /readHelpDocument\(key\)/);
  assert.match(appSource, /async function closeHelpDocument\(\)[\s\S]*nextTick\(\)[\s\S]*helpButtonRef\.value\?\.focus\(\)/);
  const resourceText = JSON.stringify(builder.extraResources);
  assert.match(resourceText, /版本变更记录\.txt/);
  assert.match(resourceText, /软件介绍\.txt/);
});

test("spirit search is debounced prefix matching and deletion uses confirmation", () => {
  assert.match(spiritSource, /createDebouncedPrefix/);
  assert.match(spiritSource, /filterByNamePrefix/);
  assert.match(spiritSource, /confirmWithRendererFocus/);
  assert.match(spiritSource, /requestSpiritDeletion/);
  assert.match(spiritSource, /spirits\.value = spirits\.value\.filter/);
  assert.match(styleSource, /\.spirit-list-panel\s*\{[\s\S]*?grid-template-rows:\s*auto auto minmax\(0, 1fr\)/);
});

test("renderer cannot read the configured touch exit password", () => {
  assert.match(brandingSource, /const \{ touchExitPassword: _secret, \.\.\.publicSettings \} = settings/);
  assert.doesNotMatch(preloadSource, /touchExitPassword/);
});

test("application icon field identifies the built-in icon as the default", () => {
  assert.match(applicationSettingsSource, /draft\.applicationIconPath \|\| t\(["']management\.defaultIcon["']\)/);
  assert.doesNotMatch(applicationSettingsSource, /draft\.applicationIconPath \|\| t\(["']common\.unavailable["']\)/);
});

test("secondary display background is managed through IPC and rendered below existing content", () => {
  assert.match(applicationSettingsSource, /chooseSecondaryBackground/);
  assert.match(applicationSettingsSource, /clearSecondaryBackground/);
  assert.match(preloadSource, /getSecondaryBackground: \(\) => ipcRenderer\.invoke\('secondary-display:background'\)/);
  assert.match(preloadSource, /chooseSecondaryBackground: \(\) => ipcRenderer\.invoke\('app-settings:choose-secondary-background'\)/);
  assert.match(mainSource, /installSecondaryDisplayBackground/);
  assert.match(mainSource, /ipcMain\.handle\('secondary-display:background'/);
  assert.match(secondaryDisplaySource, /secondary-runtime-background/);
  assert.match(secondaryDisplaySource, /background-size: 100% 100%/);
  assert.match(secondaryDisplaySource, /secondary-runtime--custom-background/);
  assert.match(secondaryDisplaySource, /--secondary-panel-alpha: 0\.7/);
  assert.match(secondaryDisplaySource, /watch\(backgroundDataUrl/);
  assert.doesNotMatch(secondaryDisplaySource, /:style="\{ backgroundImage:/);
});

test("persisted application title cannot be replaced by the renderer document title", () => {
  assert.match(mainSource, /function preventRendererTitleOverride\(window\)[\s\S]*page-title-updated[\s\S]*preventDefault/);
  assert.equal(mainSource.match(/preventRendererTitleOverride\((?:mainWindow|debugWindow|touchWindow|secondaryWindow)\)/g)?.length, 4);
});

test("games navigation owns the home and game-list selector", () => {
  assert.match(appSource, /<select[\s\S]*class="nav-tab nav-game-tab"/);
  assert.doesNotMatch(appSource, /<label[\s\S]*nav-game-tab/);
  assert.match(appSource, /v-model="gameSection"/);
  assert.match(appSource, /option value="home"/);
  assert.match(appSource, /option value="list"/);
  assert.match(appSource, /:section="gameSection"/);
  assert.doesNotMatch(gameListSource, /game-section-switcher/);
});
