export function resolveLiveOccupancyCell(index, key, selectTop) {
  const occupants = index?.get(key) || [];
  const topEntry = selectTop(occupants);
  return topEntry ? { ...topEntry, occupants } : undefined;
}
