import { normalizeGameList } from "./gameFlowState.js";

const SIMPLE_ORDER = new Map(
  ["simple-demo", "simple", "normal", "diffcult"].map((name, index) => [name, index]),
);

export function supportsGameEditor(game) {
  return game?.type === "rank" || (game?.type === "default" && SIMPLE_ORDER.has(game.name));
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
    .sort((left, right) => {
      const leftSimple = SIMPLE_ORDER.get(left.name);
      const rightSimple = SIMPLE_ORDER.get(right.name);
      if (leftSimple !== undefined || rightSimple !== undefined) {
        return (leftSimple ?? 100) - (rightSimple ?? 100);
      }
      return String(left.displayName).localeCompare(String(right.displayName));
    });
}

export async function loadSupportedGames(api) {
  if (!api?.listPlayableGames) throw new Error("Playable game list API is unavailable");
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
    games: normalizeSupportedGames(await api.listPlayableGames()),
    initializationError: initializationErrors[0] || null,
  };
}
