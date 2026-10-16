import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildMediaPreviewUrl } from "../src/lib/mediaPreview.js";

const cardSource = await readFile(
  new URL("../src/components/SimpleGameCard.vue", import.meta.url),
  "utf8",
);
const dialogSource = await readFile(
  new URL("../src/components/GameInfoEditDialog.vue", import.meta.url),
  "utf8",
);
const listSource = await readFile(
  new URL("../src/views/GameListView.vue", import.meta.url),
  "utf8",
);
const styleSource = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

test("game card exposes independent hover actions without nesting buttons", () => {
  assert.match(cardSource, /<article class="game-card"\s/);
  assert.match(cardSource, /class="game-card-main"[\s\S]*emit\('open-game'/);
  assert.match(cardSource, /class="game-card-play"[\s\S]*aria-label[\s\S]*emit\('play-game'/);
  assert.match(cardSource, /emit\('export-game'/);
  assert.match(cardSource, /emit\('delete-game'/);
  assert.match(cardSource, /:focus-within/);
  assert.doesNotMatch(cardSource, /class="game-card-edit"/);
  assert.doesNotMatch(cardSource, /<button class="game-card"[\s\S]*<button/);
  assert.doesNotMatch(cardSource, /simpleDescription|normalDescription|diffcultDescription/);
  assert.match(cardSource, /game\.name === 'simple-demo'[\s\S]*games\.testOnly/);
});

test("cover slots stay 183 by 308 and crop without distorting the source", () => {
  assert.match(
    styleSource,
    /\.game-card-cover\s*\{[^}]*width:\s*183px[^}]*height:\s*308px/s,
  );
  assert.match(
    styleSource,
    /\.game-card-cover img\s*\{[^}]*object-fit:\s*cover[^}]*object-position:\s*center/s,
  );
  assert.match(
    dialogSource,
    /\.game-info-cover-preview\s*\{[^}]*width:\s*183px[^}]*height:\s*308px/s,
  );
  assert.match(cardSource, /@error="coverFailed = true"/);
  assert.match(dialogSource, /@error="previewFailed = true"/);
});

test("game information dialog uses the image-only media picker", () => {
  assert.match(dialogSource, /<MediaPickerDialog/);
  assert.match(dialogSource, /accept="image"/);
  assert.match(dialogSource, /games\.editInfoTitle/);
  assert.match(dialogSource, /games\.editCover/);
  assert.match(dialogSource, /emit\("update:cover"/);
});

test("card edit opens the editor rather than the removed information popup", () => {
  assert.match(listSource, /emit\("open-game", game\)/);
  assert.doesNotMatch(listSource, /GameInfoEditDialog|editingGame|saveGameInfo/);
  assert.match(listSource, /@open-game="openGame"/);
});

test("game information dialog exposes child-mode visibility", () => {
  assert.match(dialogSource, /childModeVisible/);
  assert.match(dialogSource, /update:child-mode-visible/);
  assert.match(dialogSource, /firstCatalog/);
  assert.match(listSource, /includeHidden: true/);
});

test("media preview URLs preserve path segments safely", () => {
  assert.equal(buildMediaPreviewUrl(""), "");
  assert.equal(
    buildMediaPreviewUrl("Entertainment Mode/封面 1.png"),
    "led-media://preview/Entertainment%20Mode/%E5%B0%81%E9%9D%A2%201.png",
  );
  assert.equal(
    buildMediaPreviewUrl("covers\\normal.png"),
    "led-media://preview/covers/normal.png",
  );
});

test("basic information uses internal vertical scrolling for dynamic fields", () => {
  assert.match(
    styleSource,
    /\.editor-left\s*\{[^}]*max-height:\s*100%[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto[^}]*min-height:\s*0[^}]*scrollbar-gutter:\s*stable/s,
  );
  assert.match(
    styleSource,
    /\.simple-editor-fit-content \.simple-editor-layout\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s,
  );
});
