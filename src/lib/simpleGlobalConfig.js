export function applySimpleGlobalConfigPatch(target, patch) {
  for (const field of ['cover', 'type', 'mode', 'name', 'firstCatalog']) {
    if (Object.hasOwn(patch, field)) target[field] = patch[field] ?? "";
  }
  if (Object.hasOwn(patch, 'globalTimeLimit')) target.globalTimeLimit = Boolean(patch.globalTimeLimit);
  if (Object.hasOwn(patch, 'globalTimeLimitValue')) target.globalTimeLimitValue = patch.globalTimeLimitValue ?? 0;
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
