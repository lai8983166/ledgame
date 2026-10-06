export function createOrderDraft(games) {
  return [...games];
}

export function moveOrderItem(games, index, delta) {
  const target = index + delta;
  if (index < 0 || index >= games.length || target < 0 || target >= games.length) return [...games];
  const next = [...games];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function orderedGameIds(games) {
  return games.map((game) => Number(game.id));
}

// Reorder only the displayed slots; hidden/other-category records stay put.
export function reorderVisibleSlots(items, visibleIds, sourceId, targetId) {
  const ids = visibleIds.map(String);
  const from = ids.indexOf(String(sourceId));
  const to = ids.indexOf(String(targetId));
  if (from < 0 || to < 0 || from === to) return [...items];
  const nextIds = [...ids];
  nextIds.splice(to, 0, nextIds.splice(from, 1)[0]);
  const byId = new Map(items.map(item => [String(item.id), item]));
  const visible = new Set(ids);
  let index = 0;
  return items.map(item => visible.has(String(item.id)) ? byId.get(nextIds[index++]) : item);
}
