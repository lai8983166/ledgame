import test from "node:test";
import assert from "node:assert/strict";
import { loadSimpleGameVariants, normalizeSimpleGameList } from "../src/lib/simpleGameVariants.js";

test("simple game variants keep the supported order and ignore unrelated or duplicate records", () => {
  const games = normalizeSimpleGameList({
    data: [
      { id: 8, name: "normal", type: "default" },
      { id: 4, name: "other", type: "custom" },
      { id: 1, name: "simple-demo", type: "default" },
      { id: 9, name: "normal", type: "default" },
      { id: 3, name: "diffcult", type: "default" },
      { id: 2, name: "simple", type: "default" },
    ],
  });

  assert.deepEqual(games.map(({ id, name }) => ({ id, name })), [
    { id: 1, name: "simple-demo" },
    { id: 2, name: "simple" },
    { id: 8, name: "normal" },
    { id: 3, name: "diffcult" },
  ]);
});

test("variant loading seeds first and still returns existing games when seed fails", async () => {
  const calls = [];
  const result = await loadSimpleGameVariants({
    seedSimpleVariants: async () => {
      calls.push("seed");
      throw new Error("backend not ready");
    },
    listGames: async () => {
      calls.push("list");
      return { data: [{ id: 2, name: "simple", type: "default" }] };
    },
  });

  assert.deepEqual(calls, ["seed", "list"]);
  assert.equal(result.initializationError.message, "backend not ready");
  assert.deepEqual(result.games.map((game) => game.name), ["simple"]);
});
