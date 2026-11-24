export const RANK_BOMB_TYPES = Object.freeze([1, 2, 3]);

const DEFAULT_BOMB_EXPLOSION_VOLUME_PERCENT = 150;

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
      if (level?.type === 1) {
        initializeScoreBlockRange(level, payload);
      } else if (level) {
        delete level.scoreBlockCountMin;
        delete level.scoreBlockCountMax;
      }
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

function initializeScoreBlockRange(level, {maxPlayers, siteSizeWidth, siteSizeHeight}) {
  const {minX, maxX, minY, maxY} = level.bounds || {};
  const capacity = ((maxX ?? siteSizeWidth) - (minX ?? 1) + 1) * ((maxY ?? siteSizeHeight) - (minY ?? 1) + 1);
  if (!Number.isSafeInteger(capacity) || capacity < 1) return;
  const players = maxPlayers ?? 6;
  if (level.targetsPerPlayerMin != null) level.scoreBlockCountMin ??= Math.min(capacity, level.targetsPerPlayerMin * players);
  if (level.targetsPerPlayerMax != null) level.scoreBlockCountMax ??= Math.min(capacity, level.targetsPerPlayerMax * players);
}

export function createRankLevel(width = 16, height = 36, index = 0, maxPlayers = null) {
  const level = { label: index === 0 ? 'Ranking' : `Level ${index + 1}`, type: null,
    rewardPoints: 0, durationSeconds: 60, description: '', startGif: '', playIntroVideo: '', gameplayIntro: '', backgroundVoice: '',
    bombWarningAudio: '', bombExplosionAudio: '', bombExplosionVolumePercent: DEFAULT_BOMB_EXPLOSION_VOLUME_PERCENT,
    bounds: { minX: 1, minY: 1, maxX: width, maxY: height },
    targetsPerPlayerMin: 3, targetsPerPlayerMax: 4, bombMin: 0, bombMax: 1,
    bombWarningDelaySeconds: 3, bombWarningDurationSeconds: 1, refreshSeconds: 6, earlyRefresh: true };
  initializeScoreBlockRange(level, {maxPlayers, siteSizeWidth: width, siteSizeHeight: height});
  return level;
}

export function duplicateRankLevel(source, index) {
  const level = JSON.parse(JSON.stringify(source));
  level.label = index === 0 ? 'Ranking' : `Level ${index + 1}`;
  return level;
}

export function parseRankRange(value, minimum = 0, maximum = Infinity) {
  const match = /^\s*(\d+)\s*[,，]\s*(\d+)\s*$/.exec(String(value));
  if (!match) return null;
  const range = match.slice(1).map(Number);
  return range.every(Number.isSafeInteger) && range[0] >= minimum && range[0] <= range[1] && range[1] <= maximum ? range : null;
}

export const RANK_RANGE_FIELDS = Object.freeze({
  targets: ['targetsPerPlayerMin', 'targetsPerPlayerMax'],
  scoreBlocks: ['scoreBlockCountMin', 'scoreBlockCountMax'],
  bombs: ['bombMin', 'bombMax'],
  x: ['minX', 'maxX'],
  y: ['minY', 'maxY'],
});

export function parseRankEditorRange(kind, text, document) {
  if (kind === 'x' || kind === 'y') {
    const limit = Number(kind === 'x' ? document.siteSizeWidth : document.siteSizeHeight);
    const parts = String(text).trim() === '' ? ['', ''] : String(text).split(/[,，]/);
    if (parts.length !== 2) return null;
    const coordinates = parts.map(part => part.trim() === '' ? null : /^\d+$/.test(part.trim()) ? Number(part) : NaN);
    if (coordinates.some(n => n !== null && (!Number.isSafeInteger(n) || n < 1 || n > limit))) return null;
    return (coordinates[0] ?? 1) <= (coordinates[1] ?? limit) ? coordinates : null;
  }
  return parseRankRange(text, kind === 'bombs' ? 0 : 1);
}

export function rankRangeText(level, kind, drafts) {
  const values = kind === 'x' || kind === 'y' ? level?.bounds : level;
  const range = RANK_RANGE_FIELDS[kind].map(key => values?.[key] ?? '');
  return drafts.get(level)?.[kind] ?? range.join(',');
}

export function exceededScoreBlockCapacity(level, document, drafts) {
  if (level?.type !== 1) return null;
  const read = kind => parseRankEditorRange(kind, rankRangeText(level, kind, drafts), document);
  const x = read('x'), y = read('y'), blocks = read('scoreBlocks');
  if (!x || !y || !blocks) return null;
  const capacity = ((x[1] ?? document.siteSizeWidth) - (x[0] ?? 1) + 1) * ((y[1] ?? document.siteSizeHeight) - (y[0] ?? 1) + 1);
  return blocks[1] > capacity ? capacity : null;
}

export function setRankRangeDraft(level, kind, text, document, drafts) {
  drafts.set(level, { ...drafts.get(level), [kind]: text });
  const parsed = parseRankEditorRange(kind, text, document);
  if (parsed) {
    const values = kind === 'x' || kind === 'y' ? level.bounds : level;
    RANK_RANGE_FIELDS[kind].forEach((key, index) => { values[key] = parsed[index]; });
  }
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
    level.bounds ||= {};
    for (const field of ['minX','minY','maxX','maxY']) {
      const raw = level.bounds[field];
      if (raw !== '' && raw != null && Number.isFinite(Number(raw))) level.bounds[field] = Math.trunc(Number(raw)) + 1;
    }
    initializeScoreBlockRange(level, doc);
    level.rewardPoints ??= 0;
    level.bombExplosionVolumePercent ??= DEFAULT_BOMB_EXPLOSION_VOLUME_PERCENT;
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
