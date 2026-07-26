import { normalizeGameList } from "./gameFlowState.js";

export const SIMPLE_GAME_NAMES = Object.freeze([
  "simple-demo",
  "simple",
  "normal",
  "diffcult",
]);

const SIMPLE_GAME_ORDER = new Map(SIMPLE_GAME_NAMES.map((name, index) => [name, index]));

export function normalizeSimpleGameList(value) {
  const seenIds = new Set();
  const seenNames = new Set();
  return normalizeGameList(value)
    .filter((game) => SIMPLE_GAME_ORDER.has(game.name))
    .filter((game) => {
      if (seenIds.has(game.id) || seenNames.has(game.name)) {
        return false;
      }
      seenIds.add(game.id);
      seenNames.add(game.name);
      return true;
    })
    .sort((left, right) => SIMPLE_GAME_ORDER.get(left.name) - SIMPLE_GAME_ORDER.get(right.name));
}

export async function loadSimpleGameVariants(api) {
  if (!api?.listGames) {
    throw new Error("Game list API is unavailable");
  }

  let initializationError = null;
  if (api.seedSimpleVariants) {
    try {
      await api.seedSimpleVariants();
    } catch (error) {
      initializationError = error;
    }
  }

  const result = await api.listGames();
  return {
    games: normalizeSimpleGameList(result),
    initializationError,
  };
}
