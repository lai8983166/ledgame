import assert from "node:assert/strict";
import test from "node:test";

import {
  applySimpleGlobalConfigPatch,
  saveSimpleGlobalConfigDocument,
} from "../src/lib/simpleGlobalConfig.js";

test("global config save uses the persisted document without submitting unsaved matrix edits", async () => {
  const persistedDocument = {
    id: 7,
    name: "Persisted name",
    levels: [{ frameList: [{ matrices: [{ objectList: ["saved-frame"] }] }] }],
    audio: { scoreSound: "old-score.mp3", injurySound: "keep-injury.mp3" },
  };
  const liveDocument = {
    id: 7,
    name: "Unsaved local name",
    levels: [{ frameList: [{ matrices: [{ objectList: ["unsaved-frame"] }] }] }],
    audio: { scoreSound: "old-score.mp3", injurySound: "keep-injury.mp3" },
  };
  const patch = {
    name: "Updated config name",
    audio: { scoreSound: "new-score.mp3" },
  };
  let savedPayload = null;

  const result = await saveSimpleGlobalConfigDocument({
    api: {
      async getGameEditor(gameId) {
        assert.equal(gameId, 7);
        return { data: persistedDocument };
      },
      async saveGameEditor(gameId, payload) {
        assert.equal(gameId, 7);
        savedPayload = structuredClone(payload);
        return { data: { saved: true } };
      },
    },
    gameId: 7,
    patch,
    liveDocument,
    missingDocumentMessage: "missing persisted document",
  });

  assert.equal(result.data.saved, true);
  assert.deepEqual(
    savedPayload.levels[0].frameList[0].matrices[0].objectList,
    ["saved-frame"],
  );
  assert.deepEqual(
    liveDocument.levels[0].frameList[0].matrices[0].objectList,
    ["unsaved-frame"],
  );
  assert.equal(savedPayload.name, "Updated config name");
  assert.equal(liveDocument.name, "Updated config name");
  assert.deepEqual(savedPayload.audio, {
    scoreSound: "new-score.mp3",
    injurySound: "keep-injury.mp3",
  });
  assert.deepEqual(liveDocument.audio, {
    scoreSound: "new-score.mp3",
    injurySound: "keep-injury.mp3",
  });
});

test("failed global config persistence leaves the live editor document unchanged", async () => {
  const liveDocument = {
    id: 9,
    name: "Local name",
    levels: [{ frameList: [{ matrices: [{ objectList: ["local-edit"] }] }] }],
    gif: { standby: "old.gif" },
  };
  const before = structuredClone(liveDocument);

  await assert.rejects(
    saveSimpleGlobalConfigDocument({
      api: {
        async getGameEditor() {
          return {
            data: {
              id: 9,
              name: "Persisted name",
              levels: [{ frameList: [{ matrices: [{ objectList: ["saved-edit"] }] }] }],
              gif: { standby: "old.gif" },
            },
          };
        },
        async saveGameEditor() {
          throw new Error("disk full");
        },
      },
      gameId: 9,
      patch: { name: "Rejected name", gif: { standby: "new.gif" } },
      liveDocument,
      missingDocumentMessage: "missing persisted document",
    }),
    /disk full/,
  );

  assert.deepEqual(liveDocument, before);
});

test("global config patch replaces scalar fields and preserves unspecified nested media", () => {
  const target = {
    name: "Old",
    globalTimeLimit: false,
    globalTimeLimitValue: 0,
    commonConfig: {
      gameStartAudio: "start.mp3",
      gameEndSuccessAudio: "success.mp3",
    },
  };

  applySimpleGlobalConfigPatch(target, {
    name: "New",
    globalTimeLimit: true,
    globalTimeLimitValue: 45,
    commonConfig: { gameStartAudio: "new-start.mp3" },
  });

  assert.equal(target.name, "New");
  assert.equal(target.globalTimeLimit, true);
  assert.equal(target.globalTimeLimitValue, 45);
  assert.deepEqual(target.commonConfig, {
    gameStartAudio: "new-start.mp3",
    gameEndSuccessAudio: "success.mp3",
  });
});
