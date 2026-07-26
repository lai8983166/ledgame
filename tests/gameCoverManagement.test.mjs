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

test("game card keeps open and edit as independent accessible buttons", () => {
  assert.match(cardSource, /<article class="game-card">/);
  assert.match(cardSource, /class="game-card-main"[\s\S]*emit\('open-game'/);
  assert.match(cardSource, /class="game-card-edit"[\s\S]*aria-label[\s\S]*emit\('edit-game'/);
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

test("cover save reloads the latest document and changes only cover", () => {
  const saveFunction = listSource.slice(
    listSource.indexOf("async function saveGameInfo()"),
    listSource.indexOf("</script>"),
  );
  const readIndex = saveFunction.indexOf("api.getGameEditor(game.id)");
  const saveIndex = saveFunction.indexOf("api.saveGameEditor(game.id");
  assert.ok(readIndex >= 0 && readIndex < saveIndex);
  assert.match(saveFunction, /\{\s*\.\.\.latestDocument,\s*cover,\s*\}/s);
  assert.match(saveFunction, /games\.value = games\.value\.map/);
  assert.match(saveFunction, /catch \(error\)[\s\S]*editError\.value/);
  assert.match(listSource, /v-if="editingGame"/);
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
