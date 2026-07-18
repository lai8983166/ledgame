export const systemIdleStateFixture = Object.freeze({
  engineState: "IDLE",
  gameId: null,
  gameType: null,
  gameName: null,
  running: false,
  width: 16,
  height: 16,
  terminationReason: null,
  success: null,
  preparation: null,
});

export const preparingStateFixture = Object.freeze({
  engineState: "PREPARING",
  gameId: 7,
  gameType: "default",
  gameName: "Simple demo",
  running: false,
  preparation: {
    sessionId: "prep-7",
    revision: 2,
    gameId: 7,
    gameType: "default",
    gameName: "Simple demo",
    options: {
      userCount: 2,
      startLevelIndex: 0,
      stageFailurePolicy: "RETRY",
      launchMethod: "touch",
    },
  },
});

export const gameListFixture = Object.freeze([
  {
    id: 7,
    name: "Simple demo",
    type: "default",
    mode: "[1]",
    cover: "covers/simple.png",
    participants: 2,
  },
]);
