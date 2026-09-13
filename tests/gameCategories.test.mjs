import assert from "node:assert/strict";
import test from "node:test";
import { gamesInCategory, normalizeGameCategoryList } from "../src/lib/gameCategories.js";

test("game categories normalize backend envelopes and keep display order", () => {
  const categories = normalizeGameCategoryList({ data: [
    { id: 2, name: "Arcade", displayOrder: 2 },
    { categoryId: 1, name: "Family", displayOrder: 1 },
    { id: 2, name: "Duplicate" },
    { id: 3, name: "" },
  ] });
  assert.deepEqual(categories.map((item) => [item.id, item.name]), [[1, "Family"], [2, "Arcade"]]);
});

test("games in a category match the persisted primary menu id", () => {
  const games = [
    { id: 1, firstCatalog: "2" },
    { id: 2, firstCatalog: "1" },
    { id: 3, firstCatalog: "legacy-value" },
  ];
  assert.deepEqual(gamesInCategory(games, 2).map((game) => game.id), [1]);
  assert.deepEqual(gamesInCategory(games, 9), []);
});
