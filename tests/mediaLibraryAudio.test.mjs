import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const viewSource = await readFile(new URL("../src/views/MediaLibraryView.vue", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");

test("media library renders a non-autoplay audio preview with native controls", () => {
  assert.match(viewSource, /preview\.kind === 'audio'/);
  assert.match(viewSource, /<audio[\s\S]*controls[\s\S]*preload="metadata"/);
  assert.doesNotMatch(viewSource, /<audio[\s\S]*\sautoplay(?:\s|>)/);
  assert.match(viewSource, /return "AUD"/);
});

test("audio preview uses a wide, low horizontal player layout", async () => {
  const style = await readFile(new URL("../src/style.css", import.meta.url), "utf8");
  assert.match(style, /\.media-preview-stage\.audio\s*\{[^}]*width:\s*990px[^}]*height:\s*180px/s);
  assert.match(style, /\.media-audio-player\s*\{[^}]*grid-template-columns:/s);
});

test("media library stops audio on selection, refresh, and unmount", () => {
  assert.match(viewSource, /async function selectNode\(node\) \{\s*stopAudioPreview\(\)/);
  assert.match(viewSource, /async function loadMedia\(\) \{\s*stopAudioPreview\(\)/);
  assert.match(viewSource, /onBeforeUnmount\(\(\) => \{\s*stopAudioPreview\(\)/);
  assert.match(viewSource, /player\.pause\(\)/);
  assert.match(viewSource, /player\.removeAttribute\("src"\)/);
});

test("audio decoder errors become a local preview error", () => {
  assert.match(viewSource, /@error="handleAudioError"/);
  assert.match(viewSource, /kind: "error"/);
  assert.match(viewSource, /t\("media\.audioFailed"\)/);
});

test("existing media IPC classifies audio as previewable without renderer file access", () => {
  assert.match(mainSource, /audioExtensions\.has\(extension\)[\s\S]*return 'audio'/);
  assert.match(mainSource, /mediaType === 'image' \|\| mediaType === 'video' \|\| mediaType === 'audio'/);
  assert.match(mainSource, /media:get-preview-url/);
  assert.match(mainSource, /resolveMediaPath\(relativePath\)/);
});
