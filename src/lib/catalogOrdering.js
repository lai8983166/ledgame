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
