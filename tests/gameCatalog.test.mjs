import test from "node:test";
import assert from "node:assert/strict";
import { loadSupportedGames, normalizeSupportedGames } from "../src/lib/gameCatalog.js";

test("playable catalog preserves Simple order, includes Rank, and rejects unknown editors", () => {
  const games = normalizeSupportedGames({ data: [
    { gameId: 9, name: "rank-type1", displayName: "Rank", type: "rank", mode: "[1]", displayOrder: 4 },
    { gameId: 3, name: "diffcult", type: "default", mode: "[1]", displayOrder: 3 },
    { gameId: 8, name: "unsupported", type: "custom", mode: "[9]" },
    { gameId: 1, name: "simple-demo", type: "default", mode: "[1]", displayOrder: 0 },
    { gameId: 2, name: "simple", type: "default", mode: "[1]", displayOrder: 1 },
    { gameId: 4, name: "normal", type: "default", mode: "[1]", displayOrder: 2 },
  ] });

  assert.deepEqual(games.map((game) => game.name), [
    "simple-demo", "simple", "normal", "diffcult", "rank-type1",
  ]);
});

test("playable catalog reports seed failure but still loads existing games", async () => {
  const calls = [];
  const result = await loadSupportedGames({
    seedSimpleVariants: async () => calls.push("simple-seed"),
    seedRankType1: async () => {
      calls.push("rank-seed");
      throw new Error("rank seed unavailable");
    },
    listPlayableGames: async () => {
      calls.push("list");
      return { data: [{ gameId: 2, name: "simple", type: "default", mode: "[1]" }] };
    },
  });

  assert.deepEqual(calls, ["simple-seed", "rank-seed", "list"]);
  assert.equal(result.initializationError.message, "rank seed unavailable");
  assert.deepEqual(result.games.map((game) => game.name), ["simple"]);
});

test("management catalog can load hidden games without affecting player catalog", async () => {
  const calls = [];
  const result = await loadSupportedGames({
    listManageableGames: async () => {
      calls.push("manageable");
      return { data: [
        { gameId: 1, name: "hidden", type: "default", mode: "[1]", childModeVisible: false },
        { gameId: 2, name: "visible", type: "default", mode: "[1]" },
      ] };
    },
  }, { includeHidden: true });

  assert.deepEqual(calls, ["manageable"]);
  assert.deepEqual(result.games.map((game) => [game.name, game.childModeVisible]), [
    ["hidden", false], ["visible", true],
  ]);
});
