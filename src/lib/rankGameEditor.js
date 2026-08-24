export function createRankEditorPayload(value, gameId) {
  const payload = JSON.parse(JSON.stringify(value && typeof value === "object" ? value : {}));
  const normalizedId = Number(gameId);
  if (Number.isFinite(normalizedId)) payload.id = normalizedId;
  return payload;
}
