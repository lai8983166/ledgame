import { normalizeGameList } from "./gameFlowState.js";

export function supportsGameEditor(game) {
  return game?.type === "rank" || game?.type === "default";
}

export function normalizeSupportedGames(value) {
  const seen = new Set();
  return normalizeGameList(value)
    .filter(supportsGameEditor)
    .filter((game) => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return true;
    })
    .sort((left, right) => (Number.isFinite(Number(left.displayOrder)) ? Number(left.displayOrder) : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(Number(right.displayOrder)) ? Number(right.displayOrder) : Number.MAX_SAFE_INTEGER)
      || Number(left.id) - Number(right.id));
}

export async function loadSupportedGames(api, options = {}) {
  const includeHidden = Boolean(options.includeHidden);
  const listGames = includeHidden ? api?.listManageableGames : api?.listPlayableGames;
  if (!listGames) throw new Error("Playable game list API is unavailable");
  const initializationErrors = [];
  for (const seed of [api.seedSimpleVariants, api.seedRankType1]) {
    if (!seed) continue;
    try {
      await seed();
    } catch (error) {
      initializationErrors.push(error);
    }
  }
  return {
    games: normalizeSupportedGames(await listGames()),
    initializationError: initializationErrors[0] || null,
  };
}
