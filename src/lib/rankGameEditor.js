export function createRankEditorPayload(value, gameId) {
  const payload = JSON.parse(JSON.stringify(value && typeof value === "object" ? value : {}));
  const normalizedId = Number(gameId);
  if (Number.isFinite(normalizedId)) payload.id = normalizedId;
  // Rank editor coordinates are intentionally 1-based for operators. Keep
  // the persisted/runtime contract 0-based by converting only the boundary
  // fields when constructing the API payload.
  if (Array.isArray(payload.levels)) {
    for (const level of payload.levels) {
      const bounds = level?.bounds;
      if (!bounds || typeof bounds !== "object") continue;
      for (const field of ["minX", "maxX", "minY", "maxY"]) {
        const raw = bounds[field];
        if (raw === null || raw === undefined || raw === "") continue;
        const coordinate = Number(raw);
        if (Number.isFinite(coordinate)) {
          bounds[field] = Math.max(0, Math.trunc(coordinate) - 1);
        }
      }
    }
  }
  return payload;
}
