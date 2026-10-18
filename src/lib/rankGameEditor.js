export function createRankEditorPayload(value, gameId) {
  const payload = JSON.parse(JSON.stringify(value && typeof value === "object" ? value : {}));
  const normalizedId = Number(gameId);
  payload.id = Number.isInteger(normalizedId) && normalizedId > 0 ? normalizedId : null;
  if (typeof payload.name === 'string') payload.displayName = payload.name;
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

export function createRankLevel(width = 16, height = 36, index = 0) {
  return { label: index === 0 ? 'Ranking' : `Level ${index + 1}`, type: null,
    rewardPoints: 0, durationSeconds: 60, description: '', startGif: '', gameplayIntro: '', backgroundVoice: '',
    bombWarningAudio: '', bombExplosionAudio: '',
    bounds: { minX: 1, minY: 1, maxX: width, maxY: height },
    targetsPerPlayerMin: 3, targetsPerPlayerMax: 4, bombMin: 0, bombMax: 1,
    bombWarningDelaySeconds: 3, bombWarningDurationSeconds: 1, refreshSeconds: 6, earlyRefresh: true };
}

export function parseRankRange(value, minimum = 0) {
  const match = /^\s*(\d+)\s*[,，]\s*(\d+)\s*$/.exec(String(value));
  if (!match) return null;
  const range = match.slice(1).map(Number);
  return range.every(Number.isSafeInteger) && range[0] >= minimum && range[0] <= range[1] ? range : null;
}

export function normalizeRankEditorDocument(value) {
  const doc = JSON.parse(JSON.stringify(value || {}));
  doc.name = doc.displayName || doc.name || '';
  doc.palette = Array.isArray(doc.palette) ? doc.palette : [];
  doc.levels = Array.isArray(doc.levels) ? doc.levels : [];
  for (const key of ['audio', 'gif', 'commonConfig']) doc[key] = { ...(doc[key] || {}) };
  for (const [index, level] of doc.levels.entries()) {
    if (!level || typeof level !== 'object') continue;
    if (!level.label || (index === 0 && doc.levels.length === 1 && ['Type 1', 'Level 1', '\u6392\u4f4d\u8d5b'].includes(level.label))) level.label = index === 0 ? 'Ranking' : `Level ${index + 1}`;
    level.bounds ||= { minX: 0, minY: 0, maxX: (doc.siteSizeWidth || 16) - 1, maxY: (doc.siteSizeHeight || 36) - 1 };
    for (const field of ['minX','minY','maxX','maxY']) {
      const raw = level.bounds[field];
      if (raw !== '' && raw != null && Number.isFinite(Number(raw))) level.bounds[field] = Math.trunc(Number(raw)) + 1;
    }
    level.rewardPoints ??= 0;
  }
  return doc;
}

export function applyRankGlobalConfig(target, patch) {
  for (const key of ['name','description','cover','firstCatalog','childModeVisible','siteSizeWidth','siteSizeHeight',
    'globalTimeLimit','globalTimeLimitValue','minPlayers','maxPlayers','palette','audio','gif','commonConfig']) {
    if (Object.hasOwn(patch,key)) target[key] = JSON.parse(JSON.stringify(patch[key]));
  }
  target.displayName = target.name;
  if (target.wiringData?.runtimeEnabled) target.wiringData = { ...target.wiringData, width:target.siteSizeWidth, height:target.siteSizeHeight };
}
