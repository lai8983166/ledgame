<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import LanguageSelectionPanel from "../components/LanguageSelectionPanel.vue";
import TouchMatrixCanvas from "../components/TouchMatrixCanvas.vue";
import {
  extractErrorMessage,
  hasTermination,
  normalizeRuntimeState,
  touchViewForState,
} from "../lib/gameFlowState.js";
import { loadSimpleGameVariants } from "../lib/simpleGameVariants.js";
import {
  confirmTouchPreparationTransaction,
  createTouchStateCoordinator,
  returnTouchRuntimeToIdle,
} from "../lib/touchRuntimeCoordinator.js";
import {
  countdownBackground,
  startingGear,
  TOUCH_PLAYER_ASSETS,
} from "../lib/touchGameAssets.js";
import {
  createTouchCountdown,
  moveTouchCarousel,
  normalizeTouchGameDocument,
  normalizeTouchPlayerCount,
  TOUCH_GAME_COUNTDOWN_SECONDS,
  TOUCH_PLAYER_COUNTS,
  touchCarouselSlots,
} from "../lib/touchGamePreparation.js";

const api = window.ledGame;
const mediaApi = window.mediaLibrary;
const { t, locale } = useI18n({ useScope: "global" });
const defaultIdlePrompt = () => t("touch.defaultIdlePrompt");
const TOUCH_IDLE_VIDEO_ASSET = "dashboard/idle.mp4";
const TOUCH_GAME_BACKGROUND_ASSET = "touch/background.png";
const runtimeState = ref(normalizeRuntimeState(null));
const games = ref([]);
const coverUrls = ref({});
const idleVideoUrl = ref("");
const gameBackgroundUrl = ref("");
const idleVideoElement = ref(null);
const idleVideoFailed = ref(false);
const idleAwakeRequested = ref(false);
const presentationMode = ref("debug");
const entryMethod = ref("touch");
const touchIdlePromptTexts = ref({});
const touchIdlePromptFontSize = ref(72);
const idlePromptFading = ref(false);
const languagePanelOpen = ref(false);
const wristbandRead = ref(null);
const exitKeypadOpen = ref(false);
const exitCode = ref("");
const exitError = ref("");
const returnIdleDialogOpen = ref(false);
const returnIdleBusy = ref(false);
const returnIdleError = ref("");
const loadingState = ref(true);
const loadingGames = ref(false);
const gameInitializationWarning = ref("");
const busyAction = ref("");
const errorMessage = ref("");
const gamePreparationStep = ref("players");
const gameCarouselIndex = ref(0);
const gameDocument = ref(null);
const countdownValue = ref(TOUCH_GAME_COUNTDOWN_SECONDS);
const draft = reactive({
  userCount: 1,
  startLevelIndex: 0,
  stageFailurePolicy: "END_GAME",
});
let removeStateListener = null;
let removePresentationListener = null;
let removeSettingsListener = null;
let removeWristbandListener = null;
let wristbandAdvanceTimer = null;
let idlePromptTimer = null;
let cancelGameCountdown = null;
let gameWizardSessionId = null;
let syncedPreparationRevision = null;
let suppressCarouselClick = false;
let lastReturnIdleEdgeTapAt = 0;
const carouselGesture = {
  pointerId: null,
  startX: 0,
  moved: false,
};
const stateCoordinator = createTouchStateCoordinator({
  readState: () => api.touchGameState(),
  applyState: applyRuntimeState,
});

const view = computed(() => touchViewForState(runtimeState.value));
const preparation = computed(() => runtimeState.value.preparation);
const selectedGameId = computed(
  () => preparation.value?.gameId ?? runtimeState.value.gameId,
);
const selectedGame = computed(
  () => games.value.find((game) => game.id === selectedGameId.value) || null,
);
const canConfirm = computed(() =>
  Boolean(preparation.value?.sessionId && selectedGameId.value),
);
const terminated = computed(() => hasTermination(runtimeState.value));
const resultSucceeded = computed(() => runtimeState.value.success === true);
const gameplay = computed(() => runtimeState.value.gameplay || {});
const isGamePresentation = computed(() => presentationMode.value === "game");
const isWristbandEntry = computed(() => entryMethod.value === "wristband");
const carouselSlots = computed(() =>
  touchCarouselSlots(games.value, gameCarouselIndex.value),
);
const carouselGame = computed(
  () => games.value[gameCarouselIndex.value] || null,
);
const gameLevels = computed(() => gameDocument.value?.levels || []);
const selectedWizardLevel = computed(
  () => gameLevels.value[draft.startLevelIndex] || gameLevels.value[0] || null,
);
const gameBackgroundStyle = computed(() =>
  gameBackgroundUrl.value
    ? { backgroundImage: `url("${gameBackgroundUrl.value}")` }
    : {},
);
const idlePrompt = computed(() => {
  if (busyAction.value === "wake") return t("touch.waking");
  if (wristbandRead.value) return t("touch.wristbandRecognized");
  if (isWristbandEntry.value) return t("touch.scanWristband");
  return touchIdlePromptTexts.value[locale.value] || defaultIdlePrompt();
});
const activeWristbandId = computed(
  () =>
    wristbandRead.value?.wristbandId ||
    preparation.value?.options?.tokenList?.[0] ||
    "",
);
const showIdleVideo = computed(
  () =>
    view.value === "IDLE" &&
    !idleAwakeRequested.value &&
    idleVideoUrl.value &&
    !idleVideoFailed.value,
);
const statusCanvasMode = computed(() => {
  if (view.value === "STOPPED")
    return resultSucceeded.value ? "success" : "failure";
  return view.value.toLowerCase();
});

onMounted(async () => {
  document.addEventListener("visibilitychange", resumeIdleVideoWhenVisible);
  window.addEventListener("focus", resumeIdleVideoWhenVisible);
  removeStateListener = api?.onEngineState?.((state) => {
    stateCoordinator.applyBroadcast(state);
  });
  removePresentationListener =
    api?.onTouchPresentationMode?.((mode) => applyPresentationMode(mode)) ||
    null;
  removeSettingsListener =
    window.appSettings?.onChanged?.((settings) =>
      applyApplicationSettings(settings),
    ) || null;
  removeWristbandListener =
    api?.onWristbandScanned?.((payload) => handleWristbandScanned(payload)) ||
    null;
  await Promise.all([
    refreshState(),
    loadIdleVideo(),
    loadGameBackground(),
    loadPresentationMode(),
    loadApplicationSettings(),
  ]);
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", resumeIdleVideoWhenVisible);
  window.removeEventListener("focus", resumeIdleVideoWhenVisible);
  removeStateListener?.();
  removePresentationListener?.();
  removeSettingsListener?.();
  removeWristbandListener?.();
  clearTimeout(wristbandAdvanceTimer);
  stopIdlePromptAnimation();
  stopGameCountdown();
});

watch(view, async (nextView) => {
  if (nextView === "IDLE") {
    idleAwakeRequested.value = false;
    wristbandRead.value = null;
    languagePanelOpen.value = false;
    startIdlePromptAnimation();
  } else {
    stopIdlePromptAnimation();
    languagePanelOpen.value = false;
  }
  if (nextView === "PREPARING") {
    await loadGames();
  }
});

watch(showIdleVideo, async (visible) => {
  if (!visible) return;
  await nextTick();
  playIdleVideo();
});

watch(
  [view, isGamePresentation, () => preparation.value?.sessionId || null],
  ([nextView, gameMode, sessionId]) => {
    if (nextView === "PREPARING" && gameMode && sessionId) {
      if (gameWizardSessionId !== sessionId) {
        resetGamePreparationWizard(sessionId);
      }
      return;
    }
    stopGameCountdown();
    if (nextView !== "PREPARING") {
      gameWizardSessionId = null;
    }
  },
  { immediate: true },
);

function playIdleVideo() {
  idleVideoElement.value?.play().catch(() => {
    // canplay will retry after the custom media protocol finishes loading.
  });
}

async function loadPresentationMode() {
  if (!api?.touchPresentationMode) return;
  try {
    applyPresentationMode(await api.touchPresentationMode());
  } catch (_error) {
    applyPresentationMode("debug");
  }
}

function applyPresentationMode(mode) {
  presentationMode.value = mode === "game" ? "game" : "debug";
  if (presentationMode.value !== "game") {
    closeExitKeypad();
  }
}

async function loadApplicationSettings() {
  if (!window.appSettings?.get) return;
  try {
    applyApplicationSettings(await window.appSettings.get());
  } catch (_error) {
    applyApplicationSettings(null);
  }
}

function applyApplicationSettings(settings) {
  entryMethod.value =
    settings?.entryMethod === "wristband"
      ? "wristband"
      : settings?.entryMethod === "coin"
        ? "coin"
        : "touch";
  const promptTexts =
    settings?.touchIdlePromptTexts &&
    typeof settings.touchIdlePromptTexts === "object"
      ? settings.touchIdlePromptTexts
      : typeof settings?.touchIdlePromptText === "string"
        ? { [locale.value]: settings.touchIdlePromptText }
        : {};
  touchIdlePromptTexts.value = { ...promptTexts };
  const fontSize = Number(settings?.touchIdlePromptFontSize);
  touchIdlePromptFontSize.value =
    Number.isInteger(fontSize) && fontSize >= 32 && fontSize <= 200
      ? fontSize
      : 72;
  if (!isWristbandEntry.value) {
    wristbandRead.value = null;
    clearTimeout(wristbandAdvanceTimer);
  }
}

function startIdlePromptAnimation() {
  stopIdlePromptAnimation();
  if (view.value !== "IDLE") return;
  idlePromptTimer = window.setInterval(() => {
    if (view.value !== "IDLE") {
      stopIdlePromptAnimation();
      return;
    }
    idlePromptFading.value = false;
    window.requestAnimationFrame(() => {
      if (view.value === "IDLE") idlePromptFading.value = true;
    });
  }, 3000);
}

function stopIdlePromptAnimation() {
  if (idlePromptTimer !== null) {
    window.clearInterval(idlePromptTimer);
    idlePromptTimer = null;
  }
  idlePromptFading.value = false;
}

function handleIdleKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    wakeTouch();
  }
}

function openLanguagePanel(event) {
  event?.stopPropagation();
  languagePanelOpen.value = true;
}

function closeLanguagePanel(event) {
  event?.stopPropagation();
  languagePanelOpen.value = false;
}

function resumeIdleVideoWhenVisible() {
  if (document.visibilityState === "visible" && showIdleVideo.value) {
    playIdleVideo();
  }
}

async function loadIdleVideo() {
  if (!mediaApi?.getPreviewUrl) {
    idleVideoFailed.value = true;
    return;
  }
  try {
    const result = await mediaApi.getPreviewUrl(TOUCH_IDLE_VIDEO_ASSET);
    idleVideoUrl.value = result?.url || result || "";
    idleVideoFailed.value = !idleVideoUrl.value;
  } catch (_error) {
    idleVideoFailed.value = true;
  }
}

async function loadGameBackground() {
  if (!mediaApi?.getPreviewUrl) return;
  try {
    const result = await mediaApi.getPreviewUrl(TOUCH_GAME_BACKGROUND_ASSET);
    gameBackgroundUrl.value = result?.url || result || "";
  } catch (_error) {
    gameBackgroundUrl.value = "";
  }
}

async function refreshState() {
  if (!api?.touchGameState) {
    loadingState.value = false;
    errorMessage.value = t("touch.apiUnavailable");
    return;
  }
  loadingState.value = true;
  errorMessage.value = "";
  try {
    await stateCoordinator.refresh();
  } catch (error) {
    errorMessage.value = extractErrorMessage(error, t("touch.stateReadFailed"));
  } finally {
    loadingState.value = false;
  }
}

function applyRuntimeState(value) {
  const next = normalizeRuntimeState(value);
  runtimeState.value = next;
  const nextPreparation = next.preparation;
  if (
    nextPreparation &&
    syncedPreparationRevision !== nextPreparation.revision
  ) {
    syncedPreparationRevision = nextPreparation.revision;
    draft.userCount =
      nextPreparation.options.userCount ??
      selectedGame.value?.participants ??
      1;
    draft.startLevelIndex = nextPreparation.options.startLevelIndex;
    draft.stageFailurePolicy = nextPreparation.options.stageFailurePolicy;
  }
  if (!nextPreparation) {
    syncedPreparationRevision = null;
  }
}

async function runAction(name, action, { refreshOnError = false } = {}) {
  if (busyAction.value) return null;
  busyAction.value = name;
  errorMessage.value = "";
  try {
    const result = await action();
    if (result?.data || result?.engineState) {
      applyRuntimeState(result?.data ?? result);
    }
    return result;
  } catch (error) {
    errorMessage.value = extractErrorMessage(
      error,
      t("common.operationFailed"),
    );
    if (refreshOnError) {
      await refreshState();
    }
    return null;
  } finally {
    busyAction.value = "";
  }
}

async function wakeTouch() {
  if (isWristbandEntry.value) return;
  idleAwakeRequested.value = true;
  const result = await runAction("wake", () => api.createPreparation());
  if (!result && view.value === "IDLE") {
    idleAwakeRequested.value = false;
  }
}

function handleWristbandScanned(payload) {
  if (
    !isWristbandEntry.value ||
    view.value !== "IDLE" ||
    busyAction.value ||
    wristbandRead.value
  ) {
    return;
  }
  const wristbandId = String(payload?.wristbandId || "").trim();
  if (!wristbandId) return;
  idleAwakeRequested.value = true;
  wristbandRead.value = {
    wristbandId,
    balance: payload?.balance ?? null,
  };
  clearTimeout(wristbandAdvanceTimer);
  wristbandAdvanceTimer = setTimeout(() => {
    void createWristbandPreparation(wristbandId);
  }, 1200);
}

async function createWristbandPreparation(wristbandId) {
  if (!api?.createWristbandPreparation || view.value !== "IDLE") return;
  const result = await runAction("wristband", () =>
    api.createWristbandPreparation(wristbandId),
  );
  if (!result && view.value === "IDLE") {
    wristbandRead.value = null;
    idleAwakeRequested.value = false;
  }
}

async function loadGames() {
  if (!api?.listGames || loadingGames.value) return;
  loadingGames.value = true;
  errorMessage.value = "";
  gameInitializationWarning.value = "";
  try {
    const result = await loadSimpleGameVariants(api);
    games.value = result.games;
    if (result.initializationError) {
      gameInitializationWarning.value = t("games.seedWarning", {
        message: extractErrorMessage(
          result.initializationError,
          t("games.seedFailed"),
        ),
      });
    }
    if (!games.value.length && result.initializationError) {
      errorMessage.value = gameInitializationWarning.value;
      gameInitializationWarning.value = "";
    }
    await loadCoverUrls(games.value);
    const currentGameIndex = games.value.findIndex(
      (game) => game.id === selectedGameId.value,
    );
    gameCarouselIndex.value = currentGameIndex >= 0 ? currentGameIndex : 0;
  } catch (error) {
    games.value = [];
    errorMessage.value = extractErrorMessage(error, t("touch.gamesLoadFailed"));
  } finally {
    loadingGames.value = false;
  }
}

async function loadCoverUrls(items) {
  if (!mediaApi?.getPreviewUrl) return;
  const entries = await Promise.all(
    items.map(async (game) => {
      if (!game.cover) return [game.id, ""];
      try {
        const result = await mediaApi.getPreviewUrl(game.cover);
        return [game.id, result?.url || result || ""];
      } catch (_error) {
        return [game.id, ""];
      }
    }),
  );
  coverUrls.value = Object.fromEntries(entries);
}

async function chooseGame(game) {
  const sessionId = preparation.value?.sessionId;
  if (!sessionId || !game?.id) return;
  const result = await runAction(
    "select-game",
    () => api.selectPreparationGame(sessionId, game.id),
    { refreshOnError: true },
  );
  if (result) {
    draft.userCount =
      runtimeState.value.preparation?.options.userCount ??
      game.participants ??
      1;
  }
}

function resetGamePreparationWizard(sessionId) {
  stopGameCountdown();
  gameWizardSessionId = sessionId;
  gamePreparationStep.value = "players";
  gameDocument.value = null;
  countdownValue.value = TOUCH_GAME_COUNTDOWN_SECONDS;
  draft.userCount = normalizeTouchPlayerCount(
    preparation.value?.options?.userCount,
    1,
  );
  draft.startLevelIndex = Math.max(
    0,
    Math.floor(Number(preparation.value?.options?.startLevelIndex) || 0),
  );
  const currentGameIndex = games.value.findIndex(
    (game) => game.id === selectedGameId.value,
  );
  gameCarouselIndex.value = currentGameIndex >= 0 ? currentGameIndex : 0;
}

function selectPlayerCount(count) {
  if (busyAction.value) return;
  draft.userCount = normalizeTouchPlayerCount(count, draft.userCount);
}

function showGameSelection() {
  if (!TOUCH_PLAYER_COUNTS.includes(draft.userCount)) return;
  gamePreparationStep.value = "game";
}

function moveGameCarousel(offset) {
  if (!games.value.length || busyAction.value) return;
  gameCarouselIndex.value = moveTouchCarousel(
    gameCarouselIndex.value,
    offset,
    games.value.length,
  );
}

function selectCarouselSlot(slot) {
  if (suppressCarouselClick || !slot || slot.offset === 0) return;
  moveGameCarousel(slot.offset);
}

function handleCarouselPointerDown(event) {
  if (busyAction.value || event.button !== 0) return;
  carouselGesture.pointerId = event.pointerId;
  carouselGesture.startX = event.clientX;
  carouselGesture.moved = false;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function handleCarouselPointerMove(event) {
  if (carouselGesture.pointerId !== event.pointerId) return;
  if (Math.abs(event.clientX - carouselGesture.startX) >= 12) {
    carouselGesture.moved = true;
  }
}

function handleCarouselPointerUp(event) {
  if (carouselGesture.pointerId !== event.pointerId) return;
  const distance = event.clientX - carouselGesture.startX;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  carouselGesture.pointerId = null;
  if (carouselGesture.moved && Math.abs(distance) >= 48) {
    moveGameCarousel(distance < 0 ? 1 : -1);
    suppressCarouselClick = true;
    window.requestAnimationFrame(() => {
      suppressCarouselClick = false;
    });
  }
  carouselGesture.moved = false;
}

async function showLevelSelection() {
  const game = carouselGame.value;
  const sessionId = preparation.value?.sessionId;
  if (!game || !sessionId || busyAction.value || !api?.getGameEditor) return;
  const selectedPlayers = normalizeTouchPlayerCount(draft.userCount, 1);
  busyAction.value = "wizard-game";
  errorMessage.value = "";
  try {
    const selection = await api.selectPreparationGame(sessionId, game.id);
    applyRuntimeState(selection?.data ?? selection);
    draft.userCount = selectedPlayers;
    const detail = await api.getGameEditor(game.id);
    const normalized = normalizeTouchGameDocument(detail, game);
    if (!normalized.levels.length) {
      throw new Error(t("touch.noSelectableLevels"));
    }
    gameDocument.value = normalized;
    draft.startLevelIndex = Math.min(
      Math.max(0, Math.floor(Number(draft.startLevelIndex) || 0)),
      normalized.levels.length - 1,
    );
    gamePreparationStep.value = "level";
  } catch (error) {
    errorMessage.value = extractErrorMessage(
      error,
      t("touch.gameDetailsLoadFailed"),
    );
    await refreshState();
  } finally {
    busyAction.value = "";
  }
}

function selectWizardLevel(index) {
  const normalized = Math.floor(Number(index));
  if (normalized < 0 || normalized >= gameLevels.value.length) return;
  draft.startLevelIndex = normalized;
}

function returnToPreviousGameStep() {
  stopGameCountdown();
  if (gamePreparationStep.value === "countdown") {
    gamePreparationStep.value = "level";
  } else if (gamePreparationStep.value === "level") {
    gamePreparationStep.value = "game";
  } else if (gamePreparationStep.value === "game") {
    gamePreparationStep.value = "players";
  }
}

function startGameCountdown() {
  const sessionId = preparation.value?.sessionId;
  if (
    !sessionId ||
    !selectedGameId.value ||
    !selectedWizardLevel.value ||
    busyAction.value
  ) {
    return;
  }
  stopGameCountdown();
  gamePreparationStep.value = "countdown";
  cancelGameCountdown = createTouchCountdown({
    seconds: TOUCH_GAME_COUNTDOWN_SECONDS,
    onTick: (remaining) => {
      countdownValue.value = remaining;
    },
    onComplete: () => {
      cancelGameCountdown = null;
      void finishGameCountdown(sessionId);
    },
  });
}

function stopGameCountdown() {
  cancelGameCountdown?.();
  cancelGameCountdown = null;
  countdownValue.value = TOUCH_GAME_COUNTDOWN_SECONDS;
}

async function finishGameCountdown(sessionId) {
  if (
    view.value !== "PREPARING" ||
    preparation.value?.sessionId !== sessionId ||
    gamePreparationStep.value !== "countdown"
  ) {
    return;
  }
  await confirmPreparation();
  if (
    view.value === "PREPARING" &&
    preparation.value?.sessionId === sessionId
  ) {
    gamePreparationStep.value = "level";
  }
}

function levelTimeText(level) {
  const option = level?.option || {};
  if (option.timeLimitMode === "CYCLE_COUNT") {
    return t("touch.cycleCount", { value: option.timeLimitValue || 0 });
  }
  if (option.timeLimitMode === "CYCLE_SECONDS") {
    return t("touch.secondsCount", { value: option.timeLimitValue || 0 });
  }
  if (gameDocument.value?.globalTimeLimit) {
    return t("touch.secondsCount", {
      value: gameDocument.value.globalTimeLimitValue || 0,
    });
  }
  return t("touch.unlimited");
}

function levelLifeText(level) {
  const option = level?.option || {};
  return option.lifeLimitMode === "LIMITED"
    ? String(option.lifeLimitValue || 0)
    : t("touch.unlimited");
}

function preparationPatch() {
  return {
    userCount: Math.max(1, Math.floor(Number(draft.userCount) || 1)),
    startLevelIndex: Math.max(
      0,
      Math.floor(Number(draft.startLevelIndex) || 0),
    ),
    stageFailurePolicy:
      draft.stageFailurePolicy === "RETRY" ? "RETRY" : "END_GAME",
    launchMethod: preparation.value?.options.launchMethod || "touch",
  };
}

async function savePreparation() {
  const sessionId = preparation.value?.sessionId;
  if (!sessionId || !selectedGameId.value) return null;
  return runAction(
    "save-config",
    () => api.updatePreparation(sessionId, preparationPatch()),
    { refreshOnError: true },
  );
}

async function confirmPreparation() {
  const sessionId = preparation.value?.sessionId;
  if (!sessionId || !selectedGameId.value || busyAction.value) return;
  busyAction.value = "confirm";
  errorMessage.value = "";
  try {
    await confirmTouchPreparationTransaction({
      api,
      sessionId,
      patch: preparationPatch(),
      applyState: applyRuntimeState,
      recover: async (error) => {
        errorMessage.value = extractErrorMessage(
          error,
          t("common.operationFailed"),
        );
        await refreshState();
      },
    });
  } catch (_error) {
    // Recovery is part of the transaction helper so all failure points refresh
    // the authoritative state before the action becomes available again.
  } finally {
    busyAction.value = "";
  }
}

async function cancelPreparation() {
  const sessionId = preparation.value?.sessionId;
  if (!sessionId) return;
  await runAction("cancel", () => api.cancelPreparation(sessionId), {
    refreshOnError: true,
  });
}

async function returnToIdle() {
  await runAction("idle", () => api.startSystemIdle());
}

async function stopGame() {
  if (!window.confirm(t("touch.stopConfirm"))) return;
  await runAction("stop", () => api.stopTouchGame());
}

function openExitKeypad(event) {
  if (!isGamePresentation.value || exitKeypadOpen.value) return;
  if (event?.pointerType === "mouse" && event.button !== 0) return;
  exitCode.value = "";
  exitError.value = "";
  exitKeypadOpen.value = true;
}

function closeExitKeypad() {
  exitKeypadOpen.value = false;
  exitCode.value = "";
  exitError.value = "";
}

function appendExitDigit(digit) {
  if (exitCode.value.length >= 6) return;
  exitCode.value += String(digit);
  exitError.value = "";
}

function removeExitDigit() {
  exitCode.value = exitCode.value.slice(0, -1);
  exitError.value = "";
}

async function confirmExitFullScreen() {
  if (!api?.exitTouchFullScreen) {
    exitError.value = t("touch.exitApiUnavailable");
    return;
  }
  try {
    const result = await api.exitTouchFullScreen(exitCode.value);
    if (result?.success) {
      closeExitKeypad();
      return;
    }
    exitCode.value = "";
    exitError.value = t("touch.exitCodeIncorrect");
  } catch (error) {
    exitError.value = extractErrorMessage(error, t("common.operationFailed"));
  }
}

function handleReturnIdleEdgeTap(event) {
  if (returnIdleDialogOpen.value || returnIdleBusy.value) return;
  if (event?.pointerType === "mouse" && event.button !== 0) return;
  const edgeWidth = Math.min(64, Math.max(28, window.innerWidth * 0.04));
  if (!Number.isFinite(event?.clientX) || event.clientX < window.innerWidth - edgeWidth) {
    lastReturnIdleEdgeTapAt = 0;
    return;
  }
  const currentTapAt = Number(event?.timeStamp) || Date.now();
  const isDoubleTap =
    lastReturnIdleEdgeTapAt > 0 &&
    currentTapAt - lastReturnIdleEdgeTapAt <= 450;
  lastReturnIdleEdgeTapAt = isDoubleTap ? 0 : currentTapAt;
  if (!isDoubleTap) return;
  event?.preventDefault();
  closeExitKeypad();
  closeLanguagePanel();
  returnIdleError.value = "";
  returnIdleDialogOpen.value = true;
}

function closeReturnIdleDialog() {
  if (returnIdleBusy.value) return;
  returnIdleDialogOpen.value = false;
  returnIdleError.value = "";
  lastReturnIdleEdgeTapAt = 0;
}

async function confirmReturnToIdle() {
  if (returnIdleBusy.value || !api?.startSystemIdle) return;
  returnIdleBusy.value = true;
  returnIdleError.value = "";
  stopGameCountdown();
  try {
    await returnTouchRuntimeToIdle({
      api,
      engineState: view.value,
      preparationSessionId: preparation.value?.sessionId,
      applyState: applyRuntimeState,
    });
    returnIdleDialogOpen.value = false;
  } catch (error) {
    returnIdleError.value = extractErrorMessage(
      error,
      t("touch.returnIdleFailed"),
    );
  } finally {
    returnIdleBusy.value = false;
  }
}
</script>

<template>
  <main
    class="touch-shell"
    :class="{ 'touch-game-presentation': isGamePresentation }"
    :data-state="view"
    @pointerup.capture="handleReturnIdleEdgeTap"
  >
    <TouchMatrixCanvas
      v-if="view !== 'PREPARING' && (view !== 'IDLE' || idleVideoFailed)"
      :mode="statusCanvasMode"
    />

    <div
      v-if="
        isGamePresentation &&
        ['STARTING', 'RUNNING', 'SETTLING', 'STOPPED'].includes(view)
      "
      class="touch-game-motion"
      aria-hidden="true"
    >
      <span></span>
      <span></span>
      <span></span>
    </div>

    <video
      v-if="showIdleVideo"
      ref="idleVideoElement"
      class="touch-idle-video"
      :src="idleVideoUrl"
      autoplay
      loop
      muted
      playsinline
      aria-hidden="true"
      @canplay="playIdleVideo"
      @error="idleVideoFailed = true"
    ></video>

    <section
      v-if="loadingState"
      class="touch-center touch-status-panel"
      aria-live="polite"
    >
      <span class="touch-kicker">LED GAME TOUCH</span>
      <h1>{{ t("touch.connecting") }}</h1>
    </section>

    <div
      v-else-if="view === 'IDLE'"
      class="touch-idle-action"
      :class="{ 'wristband-entry': isWristbandEntry }"
      :aria-disabled="Boolean(busyAction) || isWristbandEntry"
      role="button"
      tabindex="0"
      @click="wakeTouch"
      @keydown="handleIdleKeydown"
    >
      <strong
        class="touch-idle-prompt"
        :class="{ fading: idlePromptFading }"
        :style="{ '--idle-prompt-font-size': `${touchIdlePromptFontSize}px` }"
        @animationend="idlePromptFading = false"
      >
        <span
          class="touch-idle-title-layer touch-idle-title-depth"
          aria-hidden="true"
        >
          {{ idlePrompt }}
        </span>
        <span
          class="touch-idle-title-layer touch-idle-title-glow"
          aria-hidden="true"
        >
          {{ idlePrompt }}
        </span>
        <span class="touch-idle-title-layer touch-idle-title-face">
          {{ idlePrompt }}
        </span>
        <span
          class="touch-idle-title-layer touch-idle-title-highlight"
          aria-hidden="true"
        >
          {{ idlePrompt }}
        </span>
      </strong>
      <button
        class="touch-language-trigger"
        type="button"
        @click="openLanguagePanel"
      >
        {{ t("touch.languageSelection") }}
      </button>
    </div>

    <section
      v-else-if="view === 'PREPARING' && isGamePresentation"
      class="touch-game-wizard touch-game-background"
      :style="gameBackgroundStyle"
    >
      <button
        v-if="gamePreparationStep !== 'countdown'"
        class="touch-wizard-cancel"
        type="button"
        :disabled="Boolean(busyAction)"
        @click="cancelPreparation"
      >
        {{ t("touch.returnIdle") }}
      </button>

      <div
        v-if="gamePreparationStep === 'players'"
        class="touch-wizard-screen touch-player-step"
      >
        <header class="touch-wizard-heading">
          <span>{{ t("touch.playerSetup") }}</span>
          <h1>{{ t("touch.selectPlayerCount") }}</h1>
          <i aria-hidden="true"></i>
          <p v-if="activeWristbandId" class="touch-wizard-wristband">
            {{ t("touch.wristbandId") }} {{ activeWristbandId }} ·
            {{ t("touch.wristbandBalance") }}
            {{ t("touch.balancePending") }}
          </p>
        </header>

        <div class="touch-player-grid" :aria-label="t('touch.selectPlayerCount')">
          <button
            v-for="(count, index) in TOUCH_PLAYER_COUNTS"
            :key="count"
            class="touch-player-option"
            :class="{ selected: draft.userCount === count }"
            type="button"
            :aria-pressed="draft.userCount === count"
            :disabled="Boolean(busyAction)"
            @click="selectPlayerCount(count)"
          >
            <img :src="TOUCH_PLAYER_ASSETS[index]" :alt="`${count}P`" />
            <strong>{{ count }}P</strong>
          </button>
        </div>

        <div class="touch-wizard-actions touch-wizard-actions-end">
          <button
            class="touch-wizard-next"
            type="button"
            :disabled="!TOUCH_PLAYER_COUNTS.includes(draft.userCount)"
            @click="showGameSelection"
          >
            {{ t("touch.nextStep") }}
          </button>
        </div>
      </div>

      <div
        v-else-if="gamePreparationStep === 'game'"
        class="touch-wizard-screen touch-game-step"
      >
        <header class="touch-wizard-heading">
          <span>{{ t("touch.gameSetup") }}</span>
          <h1>{{ t("touch.selectGameTitle") }}</h1>
          <i aria-hidden="true"></i>
        </header>

        <p
          v-if="gameInitializationWarning"
          class="touch-wizard-warning"
          role="status"
        >
          {{ gameInitializationWarning }}
        </p>
        <div v-if="loadingGames" class="touch-wizard-empty">
          {{ t("touch.loadingGames") }}...
        </div>
        <div v-else-if="!games.length" class="touch-wizard-empty">
          <strong>{{ t("touch.noGames") }}</strong>
          <button type="button" @click="loadGames">{{ t("touch.reload") }}</button>
        </div>
        <div v-else class="touch-carousel-shell">
          <button
            class="touch-carousel-arrow previous"
            type="button"
            :aria-label="t('touch.previousGame')"
            @click="moveGameCarousel(-1)"
          >
            ‹
          </button>
          <div
            class="touch-game-carousel"
            tabindex="0"
            :aria-label="t('touch.selectGameTitle')"
            @pointerdown="handleCarouselPointerDown"
            @pointermove="handleCarouselPointerMove"
            @pointerup="handleCarouselPointerUp"
            @pointercancel="handleCarouselPointerUp"
            @keydown.left.prevent="moveGameCarousel(-1)"
            @keydown.right.prevent="moveGameCarousel(1)"
          >
            <button
              v-for="slot in carouselSlots"
              :key="slot.key"
              class="touch-carousel-card"
              :class="{
                current: slot.offset === 0,
                previous: slot.offset < 0,
                next: slot.offset > 0,
              }"
              type="button"
              :aria-pressed="slot.offset === 0"
              @click="selectCarouselSlot(slot)"
            >
              <img
                v-if="coverUrls[slot.item.id]"
                :src="coverUrls[slot.item.id]"
                :alt="slot.item.name"
                draggable="false"
              />
              <span v-else class="touch-carousel-fallback">
                {{ slot.item.name.slice(0, 1) }}
              </span>
              <strong>{{ slot.item.name }}</strong>
            </button>
          </div>
          <button
            class="touch-carousel-arrow next"
            type="button"
            :aria-label="t('touch.nextGame')"
            @click="moveGameCarousel(1)"
          >
            ›
          </button>
        </div>

        <div class="touch-wizard-actions">
          <button
            class="touch-wizard-back"
            type="button"
            :disabled="Boolean(busyAction)"
            @click="returnToPreviousGameStep"
          >
            {{ t("touch.previousStep") }}
          </button>
          <button
            class="touch-wizard-next"
            type="button"
            :disabled="!carouselGame || Boolean(busyAction)"
            @click="showLevelSelection"
          >
            {{ busyAction === "wizard-game" ? t("touch.loadingGame") : t("touch.nextStep") }}
          </button>
        </div>
      </div>

      <div
        v-else-if="gamePreparationStep === 'level'"
        class="touch-wizard-screen touch-level-step"
      >
        <header class="touch-level-heading">
          <span class="touch-level-help">? &nbsp; {{ t("touch.howToPlay") }}</span>
          <h1>{{ gameDocument?.name || selectedGame?.name }}</h1>
        </header>

        <div class="touch-game-description">
          <strong>{{ t("touch.gameDescription") }}</strong>
          <p>{{ gameDocument?.description || t("touch.noGameDescription") }}</p>
        </div>

        <div class="touch-level-summary">
          <div>
            <span>{{ t("touch.gameDuration") }}</span>
            <strong>{{ levelTimeText(selectedWizardLevel) }}</strong>
          </div>
          <div>
            <span>{{ t("touch.lifeValue") }}</span>
            <strong>{{ levelLifeText(selectedWizardLevel) }}</strong>
          </div>
        </div>

        <section class="touch-level-picker" :aria-label="t('touch.selectLevelTitle')">
          <h2>{{ t("touch.selectLevelTitle") }}</h2>
          <div class="touch-level-grid">
            <button
              v-for="level in gameLevels"
              :key="level.index"
              type="button"
              :class="{ selected: draft.startLevelIndex === level.index }"
              :aria-pressed="draft.startLevelIndex === level.index"
              @click="selectWizardLevel(level.index)"
            >
              {{ level.index + 1 }}. {{ level.label }}
            </button>
          </div>
        </section>

        <div class="touch-wizard-actions">
          <button
            class="touch-wizard-back"
            type="button"
            :disabled="Boolean(busyAction)"
            @click="returnToPreviousGameStep"
          >
            {{ t("touch.previousStep") }}
          </button>
          <button
            class="touch-wizard-start"
            type="button"
            :disabled="!selectedWizardLevel || Boolean(busyAction)"
            @click="startGameCountdown"
          >
            {{ t("touch.startGameAction") }}
          </button>
        </div>
      </div>

      <div v-else class="touch-wizard-screen touch-countdown-step" aria-live="assertive">
        <div class="touch-countdown-visual">
          <img :src="countdownBackground" alt="" aria-hidden="true" />
          <strong>{{ countdownValue }}</strong>
        </div>
        <p>{{ t("touch.countdownHint") }}</p>
      </div>
    </section>

    <section v-else-if="view === 'PREPARING'" class="touch-preparing">
      <header class="touch-preparing-header">
        <div>
          <span class="touch-kicker">PREPARING</span>
          <h1>{{ t("touch.chooseGame") }}</h1>
          <p v-if="activeWristbandId" class="touch-preparing-wristband">
            {{ t("touch.wristbandId") }} {{ activeWristbandId }}
            <span
              >{{ t("touch.wristbandBalance") }}
              {{ t("touch.balancePending") }}</span
            >
          </p>
        </div>
        <button
          class="touch-text-button"
          type="button"
          :disabled="Boolean(busyAction)"
          @click="cancelPreparation"
        >
          {{ t("touch.returnIdle") }}
        </button>
      </header>

      <div class="touch-preparing-body">
        <section class="touch-game-browser" :aria-label="t('touch.gameList')">
          <p
            v-if="gameInitializationWarning"
            class="touch-inline-warning"
            role="status"
          >
            {{ gameInitializationWarning }}
          </p>
          <div v-if="loadingGames" class="touch-empty">
            {{ t("touch.loadingGames") }}...
          </div>
          <div v-else-if="!games.length" class="touch-empty">
            <strong>{{ t("touch.noGames") }}</strong>
            <button
              class="touch-secondary-button"
              type="button"
              @click="loadGames"
            >
              {{ t("touch.reload") }}
            </button>
          </div>
          <div v-else class="touch-game-grid">
            <button
              v-for="game in games"
              :key="game.id"
              class="touch-game-card"
              :class="{ selected: game.id === selectedGameId }"
              type="button"
              :disabled="Boolean(busyAction)"
              @click="chooseGame(game)"
            >
              <img
                v-if="coverUrls[game.id]"
                :src="coverUrls[game.id]"
                :alt="game.name"
              />
              <span v-else class="touch-cover-fallback">{{
                game.name.slice(0, 1)
              }}</span>
              <span class="touch-game-copy">
                <strong>{{ game.name }}</strong>
                <small>{{ game.type || game.mode || "Game" }}</small>
                <em v-if="game.name === 'simple-demo'">{{
                  t("games.testOnly")
                }}</em>
              </span>
            </button>
          </div>
        </section>

        <aside class="touch-config" :aria-label="t('touch.sessionSettings')">
          <div class="touch-config-heading">
            <span class="touch-kicker">SESSION OPTIONS</span>
            <h2>{{ selectedGame?.name || t("touch.chooseGameFirst") }}</h2>
          </div>

          <label class="touch-field">
            <span>{{ t("touch.playerCount") }}</span>
            <input
              v-model.number="draft.userCount"
              type="number"
              inputmode="numeric"
              min="1"
              max="32"
              step="1"
              :disabled="!selectedGameId"
            />
          </label>

          <label class="touch-field">
            <span>{{ t("touch.startLevel") }}</span>
            <input
              v-model.number="draft.startLevelIndex"
              type="number"
              inputmode="numeric"
              min="0"
              step="1"
              :disabled="!selectedGameId"
            />
          </label>

          <fieldset class="touch-fieldset" :disabled="!selectedGameId">
            <legend>{{ t("touch.afterFailure") }}</legend>
            <div class="touch-segmented">
              <button
                type="button"
                :class="{ active: draft.stageFailurePolicy === 'END_GAME' }"
                @click="draft.stageFailurePolicy = 'END_GAME'"
              >
                {{ t("touch.endGame") }}
              </button>
              <button
                type="button"
                :class="{ active: draft.stageFailurePolicy === 'RETRY' }"
                @click="draft.stageFailurePolicy = 'RETRY'"
              >
                {{ t("touch.retryLevel") }}
              </button>
            </div>
          </fieldset>

          <div class="touch-config-actions">
            <button
              class="touch-secondary-button"
              type="button"
              :disabled="!canConfirm || Boolean(busyAction)"
              @click="savePreparation"
            >
              {{ t("touch.saveConfig") }}
            </button>
            <button
              class="touch-primary-button"
              type="button"
              :disabled="!canConfirm || Boolean(busyAction)"
              @click="confirmPreparation"
            >
              {{
                t(
                  busyAction === "confirm"
                    ? "touch.starting"
                    : "touch.startGame",
                )
              }}
            </button>
          </div>
        </aside>
      </div>
    </section>

    <section
      v-else-if="view === 'STARTING' && isGamePresentation"
      class="touch-game-starting touch-game-background"
      :style="gameBackgroundStyle"
    >
      <img :src="startingGear" alt="" aria-hidden="true" />
      <h1>{{ t("touch.gameStartingWait") }}</h1>
      <p>{{ t("touch.gameStartingWaitHint") }}</p>
    </section>

    <section v-else-if="view === 'STARTING'" class="touch-center touch-status-panel">
      <span class="touch-kicker">STARTING</span>
      <h1>
        {{
          t("touch.gameStarting", {
            game: runtimeState.gameName || t("touch.gameFallback"),
          })
        }}
      </h1>
      <p>{{ t("touch.startingHint") }}</p>
    </section>

    <section
      v-else-if="view === 'RUNNING'"
      class="touch-center touch-status-panel"
    >
      <span class="touch-kicker">RUNNING</span>
      <h1>
        {{
          isGamePresentation
            ? t("touch.gameModeRunning")
            : runtimeState.gameName || t("touch.gameRunning")
        }}
      </h1>
      <p v-if="isGamePresentation">{{ t("touch.gameModeRunningHint") }}</p>
      <div v-if="!isGamePresentation" class="touch-live-stats">
        <span
          >{{ t("touch.score") }}
          <strong>{{ gameplay.score ?? 0 }}</strong></span
        >
        <span
          >{{ t("touch.life") }}
          <strong>{{ gameplay.life ?? "-" }}</strong></span
        >
      </div>
      <button
        v-if="!isGamePresentation"
        class="touch-danger-button"
        type="button"
        :disabled="Boolean(busyAction)"
        @click="stopGame"
      >
        {{ t("touch.stopGame") }}
      </button>
    </section>

    <section
      v-else-if="view === 'SETTLING'"
      class="touch-center touch-status-panel"
    >
      <span class="touch-kicker">SETTLING</span>
      <h1>{{ t("touch.settling") }}</h1>
      <p>{{ t("touch.pleaseWait") }}</p>
    </section>

    <section
      v-else-if="view === 'STOPPED'"
      class="touch-center touch-status-panel"
    >
      <span class="touch-kicker">GAME OVER</span>
      <h1 v-if="isGamePresentation && terminated">
        {{ t("touch.gameModeEnded") }}
      </h1>
      <h1 v-else-if="terminated">
        {{ t(resultSucceeded ? "touch.challengeComplete" : "touch.gameEnded") }}
      </h1>
      <h1 v-else>{{ t("touch.readyForGame") }}</h1>
      <div v-if="terminated && !isGamePresentation" class="touch-result-score">
        {{ gameplay.score ?? 0 }}
      </div>
      <button
        class="touch-primary-button"
        type="button"
        :disabled="Boolean(busyAction)"
        @click="returnToIdle"
      >
        {{ t(busyAction === "idle" ? "touch.returning" : "touch.returnIdle") }}
      </button>
    </section>

    <section v-else class="touch-center touch-status-panel">
      <span class="touch-kicker">CONNECTION</span>
      <h1>{{ t("touch.waitingState") }}</h1>
      <button
        class="touch-secondary-button"
        type="button"
        @click="refreshState"
      >
        {{ t("touch.reconnect") }}
      </button>
    </section>

    <div v-if="errorMessage" class="touch-error" role="alert">
      <span>{{ errorMessage }}</span>
      <button type="button" @click="errorMessage = ''">
        {{ t("common.close") }}
      </button>
    </div>

    <div v-if="returnIdleDialogOpen" class="touch-return-idle-backdrop">
      <section
        class="touch-return-idle-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="touch-return-idle-title"
      >
        <span class="touch-kicker">SYSTEM IDLE</span>
        <h2 id="touch-return-idle-title">
          {{ t("touch.returnIdleConfirmTitle") }}
        </h2>
        <p>{{ t("touch.returnIdleConfirmMessage") }}</p>
        <p v-if="returnIdleError" class="touch-return-idle-error" role="alert">
          {{ returnIdleError }}
        </p>
        <div class="touch-return-idle-actions">
          <button
            type="button"
            :disabled="returnIdleBusy"
            @click="closeReturnIdleDialog"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            class="confirm"
            type="button"
            :disabled="returnIdleBusy"
            @click="confirmReturnToIdle"
          >
            {{
              returnIdleBusy
                ? t("touch.returningToIdle")
                : t("touch.returnIdleConfirmAction")
            }}
          </button>
        </div>
      </section>
    </div>

    <button
      v-if="isGamePresentation && !exitKeypadOpen"
      class="touch-exit-edge"
      type="button"
      :aria-label="t('touch.openExitKeypad')"
      @pointerup="openExitKeypad"
    ></button>

    <div v-if="exitKeypadOpen" class="touch-exit-backdrop">
      <section class="touch-exit-keypad" role="dialog" aria-modal="true">
        <span class="touch-kicker">OPERATOR EXIT</span>
        <h2>{{ t("touch.exitFullScreen") }}</h2>
        <div class="touch-exit-code" aria-live="polite">
          {{ "•".repeat(exitCode.length) || "—" }}
        </div>
        <div class="touch-exit-grid">
          <button
            v-for="digit in [1, 2, 3, 4, 5, 6, 7, 8, 9]"
            :key="digit"
            type="button"
            @click="appendExitDigit(digit)"
          >
            {{ digit }}
          </button>
          <button type="button" @click="exitCode = ''">
            {{ t("touch.clear") }}
          </button>
          <button type="button" @click="appendExitDigit(0)">0</button>
          <button type="button" @click="removeExitDigit">
            {{ t("touch.backspace") }}
          </button>
        </div>
        <p v-if="exitError" class="touch-exit-error" role="alert">
          {{ exitError }}
        </p>
        <div class="touch-exit-actions">
          <button type="button" @click="closeExitKeypad">
            {{ t("common.cancel") }}
          </button>
          <button type="button" class="confirm" @click="confirmExitFullScreen">
            {{ t("common.confirm") }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="languagePanelOpen && view === 'IDLE'"
      class="touch-language-backdrop"
      role="presentation"
      @pointerdown.stop
      @click="closeLanguagePanel"
    >
      <section
        class="touch-language-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('touch.languageSelection')"
        @click.stop
      >
        <button
          class="touch-language-close"
          type="button"
          @click="closeLanguagePanel"
        >
          {{ t("common.close") }}
        </button>
        <LanguageSelectionPanel
          compact
          :show-intro="false"
          @selected="closeLanguagePanel"
        />
      </section>
    </div>
  </main>
</template>

<style scoped>
.touch-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  min-width: 320px;
  min-height: 420px;
  overflow: hidden;
  color: #f6fbff;
  background: #071018;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

.touch-shell :deep(*) {
  -webkit-user-select: none;
  user-select: none;
}

.touch-shell :deep(img) {
  -webkit-user-drag: none;
  user-drag: none;
}

.touch-center {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: min(760px, calc(100% - 48px));
  height: 100%;
  margin: 0 auto;
  text-align: center;
}

.touch-status-panel h1,
.touch-preparing h1,
.touch-config h2 {
  margin: 10px 0 0;
  color: #f8fcff;
  font-size: 42px;
  line-height: 1.12;
  letter-spacing: 0;
}

.touch-status-panel p {
  margin-top: 14px;
  color: #b8c7d2;
  font-size: 18px;
}

.touch-kicker {
  color: #78d8ff;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
}

.touch-idle-action {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 0;
  color: #f8fcff;
  background: rgba(7, 16, 24, 0.34);
  cursor: pointer;
}

.touch-idle-action.wristband-entry {
  cursor: default;
  opacity: 1;
}

.touch-idle-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #071018;
}

.touch-idle-prompt {
  position: relative;
  isolation: isolate;
  display: grid;
  width: min(90vw, 1280px);
  max-width: calc(100% - 40px);
  padding: 0.08em 0.2em 0.22em;
  color: #7ee8ff;
  font-family:
    "Arial Black", "Microsoft YaHei UI", "Microsoft YaHei", "Yu Gothic UI",
    "Malgun Gothic", Impact, sans-serif;
  font-size: min(var(--idle-prompt-font-size, 72px), 9vw, 13vh);
  font-stretch: expanded;
  font-weight: 1000;
  font-variation-settings:
    "wght" 1000,
    "wdth" 112;
  letter-spacing: 0;
  line-height: 0.96;
  text-align: center;
  white-space: nowrap;
  transform: skewX(-6deg);
  transform-origin: center;
}

.touch-idle-title-layer {
  grid-area: 1 / 1;
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: scaleX(1.1);
  transform-origin: center;
}

.touch-idle-title-depth {
  z-index: 0;
  color: #25156f;
  -webkit-text-stroke: clamp(5px, 0.52vw, 9px) #070d32;
  paint-order: stroke fill;
  text-shadow:
    1px 1px 0 #3a2891,
    2px 2px 0 #342486,
    3px 3px 0 #30207d,
    4px 4px 0 #291b70,
    5px 5px 0 #241765,
    6px 6px 0 #1d1359,
    7px 7px 0 #17104d,
    8px 8px 0 #11103f,
    11px 15px 18px rgba(2, 5, 27, 0.78);
  transform: scaleX(1.1);
}

.touch-idle-title-glow {
  z-index: 1;
  color: transparent;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: clamp(29px, 0.96vw, 38px) #06183f;
  filter: drop-shadow(0 0 3px rgba(48, 235, 255, 0.98))
    drop-shadow(0 0 14px rgba(25, 196, 255, 0.78));
  opacity: 0.98;
}

.touch-idle-title-face {
  z-index: 2;
  color: #6ee8ff;
  background: linear-gradient(
    180deg,
    #f8ffff 0%,
    #d7fbff 15%,
    #87efff 31%,
    #3fd8f4 55%,
    #20addd 76%,
    #1375b7 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: clamp(2px, 0.18vw, 3px) #0a234b;
  paint-order: stroke fill;
  text-shadow:
    0 -1px 0 rgba(255, 255, 255, 0.95),
    0 0 3px rgba(203, 255, 255, 0.9),
    0 0 12px rgba(43, 221, 255, 0.8),
    0 0 28px rgba(25, 196, 255, 0.66);
}

.touch-idle-title-highlight {
  z-index: 3;
  color: transparent;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 1) 0%,
    rgba(218, 255, 255, 0.96) 24%,
    rgba(116, 239, 255, 0.25) 48%,
    rgba(116, 239, 255, 0) 62%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 1px rgba(226, 255, 255, 0.34);
  clip-path: inset(0 0 54% 0);
  opacity: 0.92;
}

.touch-idle-prompt.fading {
  animation: touch-idle-prompt-fade 500ms ease-out both;
}

@keyframes touch-idle-prompt-fade {
  from {
    opacity: 1;
    filter: saturate(1);
  }
  to {
    opacity: 0;
    filter: saturate(0.7);
  }
}

.touch-language-trigger {
  position: absolute;
  right: 0;
  bottom: 28px;
  left: 0;
  z-index: 2;
  width: max-content;
  min-width: 180px;
  min-height: 52px;
  margin: 0 auto;
  padding: 10px 22px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 999px;
  color: #fff;
  background: rgba(5, 25, 44, 0.56);
  cursor: pointer;
  font-size: 20px;
  font-weight: 800;
}

.touch-language-trigger:hover,
.touch-language-trigger:focus-visible {
  background: rgba(16, 68, 105, 0.82);
  outline: 2px solid #c4f3ff;
  outline-offset: 3px;
}

.touch-wristband-card {
  display: grid;
  gap: 8px;
  min-width: min(420px, calc(100vw - 48px));
  margin-top: 22px;
  padding: 18px 24px;
  border: 1px solid rgba(120, 216, 255, 0.5);
  border-radius: 8px;
  background: rgba(7, 16, 24, 0.82);
}

.touch-wristband-card b {
  color: #f8fcff;
  font-size: 28px;
  letter-spacing: 0;
}

.touch-language-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(1, 9, 17, 0.72);
}

.touch-language-dialog {
  position: relative;
  width: min(820px, 100%);
  max-height: min(820px, 100%);
  overflow: auto;
  padding: 44px 24px 24px;
  border: 1px solid rgba(150, 222, 255, 0.62);
  border-radius: 12px;
  background: #071b2b;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
}

.touch-language-close {
  position: absolute;
  top: 14px;
  right: 14px;
  min-height: 38px;
  padding: 6px 14px;
  border: 1px solid #50708a;
  border-radius: 6px;
  color: #e7f8ff;
  background: #12354a;
  cursor: pointer;
  font-weight: 700;
}

.touch-language-dialog :deep(.language-selection-panel) {
  max-width: none;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.touch-language-dialog :deep(.language-option) {
  color: #e7f8ff;
  background: #102b3e;
  border-color: #315268;
}

.touch-language-dialog :deep(.language-option:has(input:checked)) {
  color: #fff;
  background: #1d4b66;
  border-color: #85dcff;
  box-shadow: inset 0 0 0 1px #85dcff;
}

.touch-game-background {
  background-color: #071426;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.touch-game-background::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: rgba(3, 20, 44, 0.28);
  content: "";
  pointer-events: none;
}

.touch-game-wizard {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.touch-wizard-screen {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  padding: clamp(24px, 3vh, 48px) clamp(74px, 8vw, 154px)
    clamp(22px, 3vh, 42px) clamp(120px, 11vw, 220px);
}

.touch-wizard-cancel {
  position: absolute;
  top: clamp(18px, 2.4vh, 34px);
  right: clamp(24px, 3vw, 54px);
  z-index: 4;
  min-width: 116px;
  min-height: 44px;
  border: 1px solid rgba(137, 226, 255, 0.58);
  border-radius: 5px;
  color: #d9f8ff;
  background: rgba(5, 35, 65, 0.78);
  cursor: pointer;
  font-weight: 800;
}

.touch-wizard-heading {
  display: grid;
  justify-items: center;
  width: min(1150px, 88%);
  margin: 0 auto;
  text-align: center;
}

.touch-wizard-heading > span {
  color: #63e3ff;
  font-size: clamp(12px, 1vw, 17px);
  font-weight: 900;
  text-transform: uppercase;
}

.touch-wizard-heading h1 {
  margin: 4px 0 8px;
  color: #d9fbff;
  font-family: "Arial Black", "Microsoft YaHei UI", sans-serif;
  font-size: clamp(32px, 4.2vw, 74px);
  font-weight: 1000;
  line-height: 1;
  text-shadow:
    0 2px 0 #173d6d,
    0 0 18px rgba(75, 231, 255, 0.72);
  transform: skewX(-4deg);
}

.touch-wizard-heading i {
  width: min(720px, 76vw);
  height: 2px;
  background: #7beeff;
  box-shadow: 0 0 10px rgba(86, 229, 255, 0.92);
}

.touch-wizard-wristband {
  margin: 8px 0 0;
  color: #b9f4ff;
  font-size: 14px;
  font-style: normal;
}

.touch-player-grid {
  align-self: center;
  display: grid;
  grid-template-columns: repeat(3, minmax(160px, 1fr));
  gap: clamp(8px, 1.4vh, 20px) clamp(22px, 4vw, 72px);
  width: min(1140px, 88%);
  margin: 8px auto;
  padding: clamp(10px, 1.5vh, 22px) clamp(18px, 3vw, 48px);
  border: 1px solid rgba(109, 236, 255, 0.76);
  background: rgba(0, 116, 156, 0.42);
  box-shadow:
    inset 0 0 34px rgba(21, 211, 238, 0.16),
    0 0 18px rgba(16, 203, 236, 0.16);
}

.touch-player-option {
  position: relative;
  justify-self: center;
  width: min(100%, 260px);
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  transition:
    filter 150ms ease,
    transform 150ms ease;
}

.touch-player-option img {
  display: block;
  width: 100%;
  height: auto;
  pointer-events: none;
  filter: saturate(0.9) brightness(0.84);
}

.touch-player-option strong {
  position: absolute;
  top: 24%;
  right: 0;
  left: 0;
  color: #a8faff;
  font-family: "Arial Black", Impact, sans-serif;
  font-size: clamp(34px, 3.6vw, 66px);
  font-style: italic;
  line-height: 1;
  text-shadow:
    3px 4px 0 #245394,
    0 0 12px rgba(96, 245, 255, 0.9);
  pointer-events: none;
}

.touch-player-option:hover,
.touch-player-option:focus-visible,
.touch-player-option.selected {
  filter: drop-shadow(0 0 12px rgba(91, 241, 255, 0.94));
  outline: none;
  transform: translateY(-4px) scale(1.04);
}

.touch-player-option.selected img {
  filter: saturate(1.2) brightness(1.12);
}

.touch-player-option.selected::after {
  position: absolute;
  inset: 4% 2% 7%;
  border: 4px solid #76f6ff;
  clip-path: polygon(50% 0, 96% 22%, 96% 70%, 50% 100%, 4% 70%, 4% 22%);
  content: "";
  filter: drop-shadow(0 0 8px #3fe7ff);
  pointer-events: none;
}

.touch-wizard-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding-top: 10px;
}

.touch-wizard-actions-end {
  justify-content: flex-end;
}

.touch-wizard-next,
.touch-wizard-start,
.touch-wizard-back {
  min-width: clamp(150px, 14vw, 250px);
  min-height: clamp(50px, 6vh, 74px);
  padding: 0 34px;
  border: 0;
  color: #fff8c2;
  background: #d19427;
  clip-path: polygon(11% 0, 100% 0, 89% 100%, 0 100%);
  cursor: pointer;
  font-family: "Arial Black", "Microsoft YaHei UI", sans-serif;
  font-size: clamp(20px, 2vw, 34px);
  font-style: italic;
  font-weight: 1000;
  text-shadow: 2px 3px 0 #77500f;
  box-shadow: inset 0 0 0 3px rgba(255, 247, 169, 0.52);
}

.touch-wizard-start {
  min-width: clamp(190px, 18vw, 310px);
  color: #fffbd2;
  background: #c98923;
}

.touch-wizard-back {
  color: #c9f8ff;
  background: rgba(13, 85, 120, 0.84);
  clip-path: polygon(0 0, 89% 0, 100% 100%, 11% 100%);
  font-size: clamp(17px, 1.5vw, 25px);
  text-shadow: 2px 2px 0 #153b5d;
}

.touch-wizard-next:disabled,
.touch-wizard-start:disabled,
.touch-wizard-back:disabled {
  cursor: not-allowed;
  filter: grayscale(0.8) brightness(0.62);
}

.touch-game-step {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.touch-carousel-shell {
  align-self: center;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 72px;
  align-items: center;
  width: min(1280px, 94%);
  margin: 0 auto;
}

.touch-game-carousel {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: clamp(18px, 3vw, 56px);
  min-width: 0;
  padding: 26px 12px;
  cursor: grab;
  outline: none;
  touch-action: pan-y;
  user-select: none;
}

.touch-game-carousel:active {
  cursor: grabbing;
}

.touch-carousel-card {
  position: relative;
  justify-self: center;
  width: min(100%, 250px);
  aspect-ratio: 183 / 308;
  padding: 7px;
  overflow: hidden;
  border: 2px solid rgba(81, 234, 255, 0.72);
  border-radius: 8px;
  color: #eaffff;
  background: #071c34;
  cursor: pointer;
  opacity: 0.7;
  transform: scale(0.82) perspective(900px) rotateY(10deg);
  transition:
    opacity 180ms ease,
    transform 180ms ease,
    filter 180ms ease;
}

.touch-carousel-card.next {
  transform: scale(0.82) perspective(900px) rotateY(-10deg);
}

.touch-carousel-card.current {
  z-index: 2;
  border-color: #fc59e8;
  opacity: 1;
  filter: drop-shadow(0 0 18px rgba(66, 239, 255, 0.7));
  transform: scale(1.06);
}

.touch-carousel-card img,
.touch-carousel-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border-radius: 5px;
  object-fit: cover;
  pointer-events: none;
}

.touch-carousel-fallback {
  color: #8cefff;
  background: #0b5071;
  font-size: 74px;
  font-weight: 900;
}

.touch-carousel-card strong {
  position: absolute;
  right: 7px;
  bottom: 7px;
  left: 7px;
  padding: 12px 8px;
  overflow: hidden;
  color: #eaffff;
  background: rgba(5, 18, 37, 0.84);
  font-size: clamp(16px, 1.7vw, 27px);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

.touch-carousel-arrow {
  width: 64px;
  height: 92px;
  border: 0;
  color: #fff48d;
  background: transparent;
  cursor: pointer;
  font-size: 88px;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 0 12px rgba(255, 220, 79, 0.82);
}

.touch-wizard-warning {
  position: absolute;
  top: 110px;
  right: 12vw;
  left: 14vw;
  margin: 0;
  color: #ffe79e;
  text-align: center;
}

.touch-wizard-empty {
  align-self: center;
  display: grid;
  place-items: center;
  gap: 18px;
  color: #d7f8ff;
  font-size: 20px;
}

.touch-wizard-empty button {
  min-height: 44px;
  padding: 0 22px;
  border: 1px solid #6de9ff;
  border-radius: 5px;
  color: #eaffff;
  background: #0d5778;
  cursor: pointer;
}

.touch-level-step {
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: clamp(10px, 1.5vh, 18px);
}

.touch-level-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  border-bottom: 2px solid rgba(116, 237, 255, 0.7);
}

.touch-level-heading h1 {
  margin: 0 0 8px;
  overflow: hidden;
  color: #dffbff;
  font-size: clamp(24px, 2.6vw, 44px);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.touch-level-help {
  padding: 7px 18px;
  border: 1px solid #75e6ff;
  color: #d8fbff;
  background: rgba(22, 97, 150, 0.68);
  font-size: clamp(18px, 1.6vw, 27px);
  font-weight: 900;
}

.touch-game-description {
  min-height: 92px;
  padding: 14px 22px;
  border-left: 7px solid #e04dde;
  color: #d8f8ff;
  background: rgba(10, 103, 143, 0.57);
}

.touch-game-description strong {
  display: block;
  color: #ffd2ff;
  font-size: clamp(18px, 1.5vw, 26px);
}

.touch-game-description p {
  display: -webkit-box;
  margin: 8px 0 0;
  overflow: hidden;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.touch-level-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px;
}

.touch-level-summary > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 56px;
  padding: 0 20px;
  color: #d6caff;
  background: rgba(4, 48, 77, 0.78);
  font-size: clamp(16px, 1.4vw, 23px);
}

.touch-level-summary strong {
  color: #87fbff;
  white-space: nowrap;
}

.touch-level-picker {
  min-height: 0;
  padding: 14px 20px;
  overflow: auto;
  border: 1px solid rgba(112, 232, 255, 0.72);
  background: rgba(4, 111, 146, 0.45);
}

.touch-level-picker h2 {
  margin: 0 0 12px;
  color: #cbefff;
  font-size: clamp(18px, 1.5vw, 25px);
}

.touch-level-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 24px;
}

.touch-level-grid button {
  min-height: clamp(42px, 5vh, 58px);
  padding: 0 14px;
  overflow: hidden;
  border: 1px solid transparent;
  color: #8feeff;
  background: transparent;
  cursor: pointer;
  font-size: clamp(15px, 1.25vw, 21px);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.touch-level-grid button:hover,
.touch-level-grid button:focus-visible,
.touch-level-grid button.selected {
  border-color: #bcffff;
  color: #07283f;
  background: #76f4f0;
  outline: none;
  box-shadow: 0 0 14px rgba(105, 244, 255, 0.55);
}

.touch-countdown-step {
  grid-template-rows: minmax(0, 1fr) auto;
  place-items: center;
  padding-top: 8vh;
  text-align: center;
}

.touch-countdown-visual {
  position: relative;
  display: grid;
  place-items: center;
  width: min(47vh, 42vw, 486px);
  aspect-ratio: 1;
}

.touch-countdown-visual img,
.touch-countdown-visual strong {
  grid-area: 1 / 1;
}

.touch-countdown-visual img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.touch-countdown-visual strong {
  color: #b9ffff;
  font-family: "Arial Black", Impact, sans-serif;
  font-size: clamp(72px, 10vw, 164px);
  font-style: italic;
  text-shadow:
    5px 7px 0 #23528d,
    0 0 24px rgba(70, 241, 255, 0.9);
}

.touch-countdown-step p {
  align-self: start;
  margin: 0 0 9vh;
  color: #fffbc6;
  font-size: clamp(22px, 3.2vw, 55px);
  font-weight: 900;
  text-shadow: 0 0 12px rgba(255, 232, 107, 0.7);
}

.touch-game-starting {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  text-align: center;
}

.touch-game-starting > * {
  position: relative;
  z-index: 1;
}

.touch-game-starting img {
  width: min(82vw, 1160px);
  max-height: 56vh;
  object-fit: contain;
}

.touch-game-starting h1 {
  margin: clamp(8px, 2vh, 24px) 24px 0;
  color: #fff4a8;
  font-size: clamp(34px, 4.2vw, 72px);
  font-weight: 1000;
  text-shadow: 0 0 16px rgba(255, 221, 76, 0.72);
}

.touch-game-starting p {
  margin: 12px 24px 0;
  color: #c9f5ff;
  font-size: clamp(18px, 1.7vw, 29px);
}

.touch-preparing {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  padding: 28px;
  background: #0a151e;
}

.touch-preparing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 20px;
}

.touch-preparing-header h1 {
  font-size: 34px;
}

.touch-preparing-wristband {
  display: flex;
  gap: 18px;
  margin: 8px 0 0;
  color: #d8f4ff;
  font-size: 14px;
}

.touch-preparing-wristband span {
  color: #9fb3c0;
}

.touch-preparing-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 34%);
  gap: 20px;
  min-height: 0;
}

.touch-game-browser {
  min-width: 0;
  overflow: auto;
}

.touch-game-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.touch-game-card {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  min-height: 104px;
  padding: 0;
  overflow: hidden;
  border: 1px solid #233745;
  border-radius: 8px;
  color: #eef8ff;
  text-align: left;
  background: #10212c;
  cursor: pointer;
}

.touch-game-card.selected {
  border-color: #55d1ff;
  box-shadow: inset 0 0 0 2px #55d1ff;
}

.touch-game-card img,
.touch-cover-fallback {
  width: 104px;
  height: 104px;
  object-fit: cover;
  background: #162f3e;
}

.touch-cover-fallback {
  display: grid;
  place-items: center;
  color: #78d8ff;
  font-size: 34px;
  font-weight: 800;
}

.touch-game-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 14px;
}

.touch-game-copy strong,
.touch-game-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.touch-game-copy small {
  margin-top: 7px;
  color: #9fb3c0;
}

.touch-game-copy em {
  margin-top: 7px;
  color: #ffd166;
  font-size: 12px;
  font-style: normal;
}

.touch-inline-warning {
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid #705822;
  border-radius: 6px;
  color: #ffe2a0;
  background: #2c2413;
  font-size: 13px;
}

.touch-config {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 22px;
  border: 1px solid #263a47;
  border-radius: 8px;
  background: #0d1b24;
}

.touch-config h2 {
  overflow: hidden;
  font-size: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.touch-field,
.touch-fieldset {
  display: grid;
  gap: 8px;
  margin-top: 20px;
  color: #b8c8d2;
  font-size: 14px;
}

.touch-fieldset {
  padding: 0;
  border: 0;
}

.touch-field input {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: 1px solid #304856;
  border-radius: 6px;
  color: #f6fbff;
  background: #071018;
  font-size: 16px;
}

.touch-segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 7px;
  background: #071018;
}

.touch-segmented button {
  min-height: 42px;
  border: 0;
  border-radius: 5px;
  color: #91a7b5;
  background: transparent;
  cursor: pointer;
}

.touch-segmented button.active {
  color: #071018;
  background: #70d8ff;
}

.touch-config-actions {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 10px;
  margin-top: auto;
  padding-top: 22px;
}

.touch-primary-button,
.touch-secondary-button,
.touch-danger-button,
.touch-text-button {
  min-height: 46px;
  padding: 0 18px;
  border-radius: 7px;
  cursor: pointer;
  font-weight: 750;
}

.touch-primary-button {
  border: 0;
  color: #061119;
  background: #70d8ff;
}

.touch-secondary-button {
  border: 1px solid #35505f;
  color: #d9e8f0;
  background: #112630;
}

.touch-danger-button {
  margin-top: 34px;
  border: 1px solid #8e4552;
  color: #ffc3ca;
  background: #321820;
}

.touch-text-button {
  border: 0;
  color: #a8bbc7;
  background: transparent;
}

button:disabled,
input:disabled,
fieldset:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.touch-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 18px;
  min-height: 260px;
  color: #a8bac5;
}

.touch-live-stats {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.touch-live-stats span {
  min-width: 130px;
  padding: 14px 18px;
  border: 1px solid rgba(154, 222, 247, 0.38);
  border-radius: 7px;
  background: rgba(7, 16, 24, 0.72);
}

.touch-live-stats strong {
  margin-left: 8px;
  font-size: 22px;
}

.touch-result-score {
  margin: 26px 0;
  font-size: 72px;
  font-weight: 800;
}

.touch-error {
  position: absolute;
  z-index: 3;
  right: 18px;
  bottom: 18px;
  left: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 52px;
  padding: 10px 14px;
  border: 1px solid #a54a58;
  border-radius: 7px;
  color: #ffd4d9;
  background: #35151d;
}

.touch-error button {
  border: 0;
  color: #ffffff;
  background: transparent;
  cursor: pointer;
}

.touch-shell button {
  touch-action: manipulation;
}

.touch-game-motion {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.touch-game-motion span {
  position: absolute;
  left: -24vw;
  width: 22vw;
  height: 4px;
  background: #48b6df;
  opacity: 0.42;
  animation: touch-game-scan 4.2s linear infinite;
}

.touch-game-motion span:nth-child(1) {
  top: 24%;
}

.touch-game-motion span:nth-child(2) {
  top: 50%;
  animation-delay: 1.4s;
}

.touch-game-motion span:nth-child(3) {
  top: 76%;
  animation-delay: 2.8s;
}

@keyframes touch-game-scan {
  to {
    transform: translateX(148vw);
  }
}

.touch-exit-edge {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 12;
  width: 10%;
  border: 0;
  opacity: 0;
  background: transparent;
  cursor: default;
}

.touch-exit-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(2, 8, 13, 0.86);
}

.touch-exit-keypad {
  width: min(480px, 92vw);
  display: grid;
  gap: 18px;
  padding: 28px;
  border: 1px solid #31556c;
  border-radius: 8px;
  background: #0b1b27;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.46);
  text-align: center;
}

.touch-exit-keypad h2 {
  margin: 0;
  font-size: 30px;
}

.touch-exit-code {
  min-height: 58px;
  display: grid;
  place-items: center;
  border: 1px solid #29495e;
  border-radius: 6px;
  color: #dff6ff;
  background: #07131c;
  font-size: 34px;
  letter-spacing: 10px;
}

.touch-exit-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.touch-exit-grid button,
.touch-exit-actions button {
  min-height: 64px;
  border: 1px solid #34566b;
  border-radius: 7px;
  color: #eaf8ff;
  background: #112a3a;
  cursor: pointer;
  font-size: 21px;
  font-weight: 720;
}

.touch-exit-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.touch-exit-actions .confirm {
  border-color: #4387aa;
  background: #236783;
}

.touch-exit-error {
  margin: 0;
  color: #ffadb5;
}

.touch-return-idle-backdrop {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(2, 8, 18, 0.84);
}

.touch-return-idle-dialog {
  width: min(520px, 92vw);
  padding: 30px;
  border: 1px solid #4aa9cc;
  border-radius: 8px;
  color: #eafaff;
  background: #0a2030;
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.52);
  text-align: center;
}

.touch-return-idle-dialog h2 {
  margin: 10px 0 0;
  font-size: 30px;
}

.touch-return-idle-dialog > p {
  margin: 14px 0 0;
  color: #bad0dc;
  line-height: 1.55;
}

.touch-return-idle-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 26px;
}

.touch-return-idle-actions button {
  min-height: 54px;
  border: 1px solid #426276;
  border-radius: 6px;
  color: #e6f8ff;
  background: #143347;
  cursor: pointer;
  font-size: 17px;
  font-weight: 800;
}

.touch-return-idle-actions button.confirm {
  border-color: #55c9ed;
  color: #04141c;
  background: #6edcff;
}

.touch-return-idle-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.touch-return-idle-dialog .touch-return-idle-error {
  color: #ffadb8;
}

@media (max-width: 760px) {
  .touch-wizard-screen {
    padding: 20px 24px 18px 82px;
  }

  .touch-wizard-cancel {
    top: 12px;
    right: 14px;
    min-width: 92px;
    min-height: 38px;
  }

  .touch-wizard-heading {
    width: 100%;
  }

  .touch-wizard-heading h1 {
    max-width: calc(100% - 92px);
    font-size: 30px;
  }

  .touch-player-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
    width: 100%;
    overflow: auto;
  }

  .touch-carousel-shell {
    grid-template-columns: 42px minmax(0, 1fr) 42px;
    width: 100%;
  }

  .touch-game-carousel {
    gap: 8px;
  }

  .touch-carousel-arrow {
    width: 40px;
    font-size: 56px;
  }

  .touch-carousel-card {
    padding: 3px;
  }

  .touch-level-summary,
  .touch-level-grid {
    grid-template-columns: 1fr;
  }

  .touch-level-step {
    overflow: auto;
  }

  .touch-level-picker {
    min-height: 240px;
  }

  .touch-preparing {
    padding: 18px;
  }

  .touch-preparing-body {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .touch-game-browser {
    overflow: visible;
  }

  .touch-game-grid {
    grid-template-columns: 1fr;
  }

  .touch-config {
    min-height: 420px;
  }

  .touch-status-panel h1,
  .touch-idle-prompt {
    font-size: 34px;
  }
}

@media (max-height: 760px) and (min-width: 761px) {
  .touch-wizard-screen {
    padding-top: 18px;
    padding-bottom: 16px;
  }

  .touch-wizard-heading h1 {
    font-size: clamp(30px, 3.5vw, 50px);
  }

  .touch-player-grid {
    gap: 4px 38px;
    padding-top: 4px;
    padding-bottom: 4px;
  }

  .touch-player-option {
    width: min(100%, 205px);
  }

  .touch-carousel-card {
    width: min(100%, 190px);
  }

  .touch-game-description {
    min-height: 72px;
    padding-top: 9px;
    padding-bottom: 9px;
  }

  .touch-level-step {
    gap: 7px;
  }

  .touch-level-grid button {
    min-height: 38px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .touch-idle-prompt.fading {
    animation: none;
  }
}
</style>
