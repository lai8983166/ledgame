export function normalizeGameCategory(value) {
  if (!value || typeof value !== "object") return null;
  const id = Number(value.id ?? value.categoryId);
  if (!Number.isFinite(id)) return null;
  const name = String(value.name || "").trim();
  if (!name) return null;
  return {
    id,
    name,
    cover: typeof value.cover === "string" ? value.cover.trim() : "",
    displayOrder: Number.isFinite(Number(value.displayOrder)) ? Number(value.displayOrder) : null,
  };
}

export function normalizeGameCategoryList(value) {
  const source = value?.data ?? value;
  if (!Array.isArray(source)) return [];
  const seen = new Set();
  return source
    .map(normalizeGameCategory)
    .filter((category) => {
      if (!category || seen.has(category.id)) return false;
      seen.add(category.id);
      return true;
    })
    .sort((left, right) =>
      (left.displayOrder ?? Number.MAX_SAFE_INTEGER) - (right.displayOrder ?? Number.MAX_SAFE_INTEGER)
      || left.id - right.id,
    );
}

export function gamesInCategory(games, categoryId) {
  const normalizedId = String(categoryId ?? "");
  return (Array.isArray(games) ? games : []).filter((game) =>
    String(game?.firstCatalog ?? "") === normalizedId,
  );
}
