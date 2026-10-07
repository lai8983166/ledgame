import { createWiringDocument, WIRING_MODES } from './elc408/elc408Wiring.js';

export function createGameWiringDraft(saved, width, height, global) {
  const source = saved?.runtimeEnabled === true ? saved
    : global?.width === width && global?.height === height ? global : null;
  return {
    ...createWiringDocument({width,height,mode:source?.mode || 'TURN_BACK_ROW_PRIORITY',maxPointsPerChannel:source?.maxPointsPerChannel || 64}),
    lines: source?.lines?.length ? JSON.parse(JSON.stringify(source.lines)) : [[]],
  };
}

export function serializeGameWiring(draft) {
  if (!Number.isInteger(draft.width) || draft.width < 1 || !Number.isInteger(draft.height) || draft.height < 1
    || !WIRING_MODES.includes(draft.mode) || !Number.isInteger(draft.maxPointsPerChannel)
    || draft.maxPointsPerChannel < 1 || draft.maxPointsPerChannel > 170 || !draft.lines?.length) {
    throw new Error('gameWiring.invalid');
  }
  const occupied = new Set();
  for (const line of draft.lines) {
    if (!Array.isArray(line) || line.length > draft.maxPointsPerChannel) throw new Error('gameWiring.invalid');
    for (const point of line) {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isInteger)
        || point[0] < 0 || point[0] >= draft.width || point[1] < 0 || point[1] >= draft.height
        || occupied.has(point.join(':'))) throw new Error('gameWiring.invalid');
      occupied.add(point.join(':'));
    }
  }
  return {runtimeEnabled:true,width:draft.width,height:draft.height,mode:draft.mode,
    maxPointsPerChannel:draft.maxPointsPerChannel,cellSize:20,lines:JSON.parse(JSON.stringify(draft.lines))};
}

export async function saveGameWiring(api, gameId, rank, wiring, liveDocument) {
  const result = await (rank ? api.getRankGameEditor(gameId) : api.getGameEditor(gameId));
  const persisted = result?.data;
  if (!persisted) throw new Error('gameWiring.missing');
  if (persisted.siteSizeWidth !== wiring.width || persisted.siteSizeHeight !== wiring.height) {
    throw new Error('gameWiring.saveSizeFirst');
  }
  persisted.wiringData = wiring;
  const saved = await (rank ? api.saveRankGameEditor(gameId, persisted) : api.saveGameEditor(gameId, persisted));
  if (saved?.code && saved.code !== 200 || saved?.data?.saved !== true) throw new Error(saved?.message || 'gameWiring.saveFailed');
  if (liveDocument) liveDocument.wiringData = JSON.parse(JSON.stringify(wiring));
  return saved;
}
