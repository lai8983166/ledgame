export function applySimpleGlobalConfigPatch(target, patch) {
  if (Object.hasOwn(patch, 'childModeVisible')) target.childModeVisible = Boolean(patch.childModeVisible);
  for (const field of ['cover', 'name', 'firstCatalog']) {
    if (Object.hasOwn(patch, field)) target[field] = patch[field] ?? "";
  }
  if (Object.hasOwn(patch, 'globalTimeLimit')) target.globalTimeLimit = Boolean(patch.globalTimeLimit);
  if (Object.hasOwn(patch, 'globalTimeLimitValue')) target.globalTimeLimitValue = patch.globalTimeLimitValue ?? 0;
  if (Object.hasOwn(patch, 'globalLifeLimit')) target.globalLifeLimit = Boolean(patch.globalLifeLimit);
  if (Object.hasOwn(patch, 'globalLifeLimitValue')) target.globalLifeLimitValue = patch.globalLifeLimitValue ?? 0;
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
  if ((result?.data ?? result)?.saved !== true) {
    throw new Error(result?.message || 'SAVE_NOT_CONFIRMED');
  }
  if (liveDocument) {
    applySimpleGlobalConfigPatch(liveDocument, patch);
  }
  return result;
}
