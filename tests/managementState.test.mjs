import assert from "node:assert/strict";
import test from "node:test";
import { createOrderDraft, moveOrderItem, orderedGameIds } from "../src/lib/catalogOrdering.js";
import { createDebouncedPrefix, filterByNamePrefix } from "../src/lib/debouncedPrefixFilter.js";
import { requestSpiritDeletion } from "../src/lib/spiritLibraryState.js";

test("spirit prefix filtering trims input, ignores English case, supports clear and preserves source", () => {
  const source = [{ id: "1", name: " Alpha" }, { id: "2", name: "alpine" }, { id: "3", name: "Beta" }];
  assert.deepEqual(filterByNamePrefix(source, " AL ").map((item) => item.id), ["1", "2"]);
  assert.deepEqual(filterByNamePrefix(source, "").map((item) => item.id), ["1", "2", "3"]);
  assert.deepEqual(filterByNamePrefix(source, "missing"), []);
  assert.equal(source.length, 3);
});

test("rapid spirit search updates apply only the last value after exactly 250ms", () => {
  const timers = [];
  const cleared = new Set();
  const values = [];
  const debounce = createDebouncedPrefix({
    onChange: (value) => values.push(value),
    setTimeoutFn: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeoutFn: (timer) => cleared.add(timer),
  });
  debounce.update("a"); debounce.update("al"); debounce.update(" alp ");
  assert.deepEqual(timers.map((timer) => timer.delay), [250, 250, 250]);
  for (const timer of timers) if (!cleared.has(timer)) timer.callback();
  assert.deepEqual(values, ["alp"]);
});

test("spirit deletion cancellation sends no request, success selects adjacent item, and failure is propagated", async () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const removed = [];
  assert.deepEqual(await requestSpiritDeletion({
    selected: items[1], visibleItems: items, confirm: async () => false, remove: async (id) => removed.push(id),
  }), { status: "cancelled", selectedId: "b" });
  assert.deepEqual(removed, []);
  assert.deepEqual(await requestSpiritDeletion({
    selected: items[1], visibleItems: items, confirm: async () => true, remove: async (id) => removed.push(id),
  }), { status: "deleted", selectedId: "c" });
  assert.deepEqual(removed, ["b"]);
  await assert.rejects(() => requestSpiritDeletion({
    selected: items[0], visibleItems: items, confirm: async () => true, remove: async () => { throw new Error("backend rejected"); },
  }), /backend rejected/);
});

test("catalog ordering uses an isolated draft, respects move boundaries and submits every numeric ID", () => {
  const original = [{ id: "1" }, { id: "2" }, { id: "3" }];
  const draft = createOrderDraft(original);
  const unchanged = moveOrderItem(draft, 0, -1);
  const moved = moveOrderItem(draft, 1, 1);
  assert.notEqual(draft, original);
  assert.deepEqual(unchanged.map((game) => game.id), ["1", "2", "3"]);
  assert.deepEqual(moved.map((game) => game.id), ["1", "3", "2"]);
  assert.deepEqual(original.map((game) => game.id), ["1", "2", "3"]);
  assert.deepEqual(orderedGameIds(moved), [1, 3, 2]);
});
