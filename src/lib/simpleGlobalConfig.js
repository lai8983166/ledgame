export function applySimpleGlobalConfigPatch(target, patch) {
  target.cover = patch.cover ?? "";
  target.type = patch.type ?? "";
  target.mode = patch.mode ?? "";
  target.name = patch.name ?? "";
  target.firstCatalog = patch.firstCatalog ?? "";
  target.globalTimeLimit = Boolean(patch.globalTimeLimit);
  target.globalTimeLimitValue = patch.globalTimeLimitValue ?? 0;
  target.audio = { ...(target.audio || {}), ...(patch.audio || {}) };
  target.gif = { ...(target.gif || {}), ...(patch.gif || {}) };
  target.commonConfig = { ...(target.commonConfig || {}), ...(patch.commonConfig || {}) };
  return target;
}

export async function saveSimpleGlobalConfigDocument({
  api,
  gameId,
  patch,
  liveDocument,
  missingDocumentMessage,
}) {
  const detail = await api.getGameEditor(gameId);
  const persistedDocument = detail?.data;
  if (!persistedDocument) {
    throw new Error(missingDocumentMessage);
  }

  applySimpleGlobalConfigPatch(persistedDocument, patch);
  const result = await api.saveGameEditor(gameId, persistedDocument);
  if (liveDocument) {
    applySimpleGlobalConfigPatch(liveDocument, patch);
  }
  return result;
}
