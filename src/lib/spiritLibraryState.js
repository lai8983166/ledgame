export function selectionAfterDeletion(visibleItems, deletedId) {
  const index = visibleItems.findIndex((item) => item.id === deletedId);
  if (index < 0) return visibleItems[0]?.id || "";
  const remaining = visibleItems.filter((item) => item.id !== deletedId);
  return remaining[Math.min(index, remaining.length - 1)]?.id || "";
}

export async function requestSpiritDeletion({ selected, visibleItems, confirm, remove }) {
  if (!selected) return { status: "unavailable", selectedId: "" };
  if (!await confirm(selected)) return { status: "cancelled", selectedId: selected.id };
  const selectedId = selectionAfterDeletion(visibleItems, selected.id);
  await remove(selected.id);
  return { status: "deleted", selectedId };
}
