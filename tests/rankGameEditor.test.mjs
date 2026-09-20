import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRankEditorPayload } from "../src/lib/rankGameEditor.js";

test("Rank editor detaches reactive proxies and converts displayed coordinates for IPC", () => {
  const level = new Proxy({ type: 1, bounds: { minX: 1, minY: 1, maxX: 16, maxY: 36 } }, {});
  const document = new Proxy({ id: 7, type: "rank", levels: [level] }, {});

  assert.throws(() => structuredClone(document), { name: "DataCloneError" });

  const payload = createRankEditorPayload(document, 12);
  assert.deepEqual(structuredClone(payload), {
    id: 12,
    type: "rank",
    levels: [{ type: 1, bounds: { minX: 0, minY: 0, maxX: 15, maxY: 35 } }],
  });
});

test("Rank editor keeps non-coordinate level data and clamps coordinates at zero", () => {
  const payload = createRankEditorPayload({
    levels: [{
      bounds: { minX: 0, minY: 2.9, maxX: 20, maxY: "4" },
      durationSeconds: 30,
    }],
  }, null);

  assert.deepEqual(payload.levels[0], {
    bounds: { minX: 0, minY: 1, maxX: 19, maxY: 3 },
    durationSeconds: 30,
  });
});

test("Rank editor exposes the shared media picker and previews for all lifecycle media", async () => {
  const sourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/views/RankGameEditorView.vue",
  );
  const source = await readFile(sourcePath, "utf8");

  for (const pattern of [
    /MediaPickerDialog/,
    /commonConfig\.gameStartAudio/,
    /commonConfig\.gameEndSuccessAudio/,
    /commonConfig\.gameEndFailAudio/,
    /commonConfig\.levelPassAudio/,
    /commonConfig\.levelRestartAudio/,
    /audio\.scoreSound/,
    /audio\.injurySound/,
    /gif\.levelFailure/,
    /gif\.levelSettlement/,
    /gif\.gameFailure/,
    /gif\.gameOver/,
    /level\.backgroundVoice/,
    /level\.gameplayIntro/,
    /rank-media-image-grid/,
    /rank-media-audio-grid/,
    /rank\.imageMediaHint/,
    /buildMediaPreviewUrl/,
    /<audio :src="audioPreview\.url"/,
  ]) {
    assert.match(source, pattern);
  }
});
