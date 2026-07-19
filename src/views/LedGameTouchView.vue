<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import TouchMatrixCanvas from "../components/TouchMatrixCanvas.vue";
import {
  extractErrorMessage,
  hasTermination,
  normalizeGameList,
  normalizeRuntimeState,
  touchViewForState,
} from "../lib/gameFlowState.js";

const api = window.ledGame;
const mediaApi = window.mediaLibrary;
const { t } = useI18n();
const TOUCH_IDLE_VIDEO_ASSET = "dashboard/idle.mp4";
const runtimeState = ref(normalizeRuntimeState(null));
const games = ref([]);
const coverUrls = ref({});
const idleVideoUrl = ref("");
const idleVideoElement = ref(null);
const idleVideoFailed = ref(false);
const idleAwakeRequested = ref(false);
const loadingState = ref(true);
const loadingGames = ref(false);
const busyAction = ref("");
const errorMessage = ref("");
const stateBroadcastVersion = ref(0);
const draft = reactive({
  userCount: 1,
  startLevelIndex: 0,
  stageFailurePolicy: "END_GAME",
});
let removeStateListener = null;
let syncedPreparationRevision = null;

const view = computed(() => touchViewForState(runtimeState.value));
const preparation = computed(() => runtimeState.value.preparation);
const selectedGameId = computed(() => preparation.value?.gameId ?? runtimeState.value.gameId);
const selectedGame = computed(() =>
  games.value.find((game) => game.id === selectedGameId.value) || null,
);
const canConfirm = computed(() => Boolean(preparation.value?.sessionId && selectedGameId.value));
const terminated = computed(() => hasTermination(runtimeState.value));
const resultSucceeded = computed(() => runtimeState.value.success === true);
const gameplay = computed(() => runtimeState.value.gameplay || {});
const showIdleVideo = computed(() =>
  view.value === "IDLE" && !idleAwakeRequested.value && idleVideoUrl.value && !idleVideoFailed.value,
);
const statusCanvasMode = computed(() => {
  if (view.value === "STOPPED") return resultSucceeded.value ? "success" : "failure";
  return view.value.toLowerCase();
});

onMounted(async () => {
  document.addEventListener("visibilitychange", resumeIdleVideoWhenVisible);
  window.addEventListener("focus", resumeIdleVideoWhenVisible);
  removeStateListener = api?.onEngineState?.((state) => {
    stateBroadcastVersion.value += 1;
    applyRuntimeState(state);
  });
  await Promise.all([refreshState(), loadIdleVideo()]);
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", resumeIdleVideoWhenVisible);
  window.removeEventListener("focus", resumeIdleVideoWhenVisible);
  removeStateListener?.();
});

watch(view, async (nextView) => {
  if (nextView === "IDLE") {
    idleAwakeRequested.value = false;
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

function playIdleVideo() {
  idleVideoElement.value?.play().catch(() => {
    // canplay will retry after the custom media protocol finishes loading.
  });
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

async function refreshState() {
  if (!api?.touchGameState) {
    loadingState.value = false;
    errorMessage.value = t("touch.apiUnavailable");
    return;
  }
  const versionBeforeRequest = stateBroadcastVersion.value;
  loadingState.value = true;
  errorMessage.value = "";
  try {
    const result = await api.touchGameState();
    if (stateBroadcastVersion.value === versionBeforeRequest) {
      applyRuntimeState(result?.data ?? result);
    }
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
  if (nextPreparation && syncedPreparationRevision !== nextPreparation.revision) {
    syncedPreparationRevision = nextPreparation.revision;
    draft.userCount = nextPreparation.options.userCount ?? selectedGame.value?.participants ?? 1;
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
    errorMessage.value = extractErrorMessage(error, t("common.operationFailed"));
    if (refreshOnError) {
      await refreshState();
    }
    return null;
  } finally {
    busyAction.value = "";
  }
}

async function wakeTouch() {
  idleAwakeRequested.value = true;
  const result = await runAction("wake", () => api.createPreparation());
  if (!result && view.value === "IDLE") {
    idleAwakeRequested.value = false;
  }
}

async function loadGames() {
  if (!api?.listGames || loadingGames.value) return;
  loadingGames.value = true;
  errorMessage.value = "";
  try {
    const result = await api.listGames();
    games.value = normalizeGameList(result);
    await loadCoverUrls(games.value);
  } catch (error) {
    errorMessage.value = extractErrorMessage(error, t("touch.gamesLoadFailed"));
  } finally {
    loadingGames.value = false;
  }
}

async function loadCoverUrls(items) {
  if (!mediaApi?.getPreviewUrl) return;
  const entries = await Promise.all(items.map(async (game) => {
    if (!game.cover) return [game.id, ""];
    try {
      const result = await mediaApi.getPreviewUrl(game.cover);
      return [game.id, result?.url || result || ""];
    } catch (_error) {
      return [game.id, ""];
    }
  }));
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
    draft.userCount = runtimeState.value.preparation?.options.userCount ?? game.participants ?? 1;
  }
}

function preparationPatch() {
  return {
    userCount: Math.max(1, Math.floor(Number(draft.userCount) || 1)),
    startLevelIndex: Math.max(0, Math.floor(Number(draft.startLevelIndex) || 0)),
    stageFailurePolicy: draft.stageFailurePolicy === "RETRY" ? "RETRY" : "END_GAME",
    launchMethod: "touch",
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
    const updated = await api.updatePreparation(sessionId, preparationPatch());
    applyRuntimeState(updated?.data ?? updated);
    const confirmed = await api.confirmPreparation(sessionId);
    applyRuntimeState(confirmed?.data ?? confirmed);
  } catch (error) {
    errorMessage.value = extractErrorMessage(error, t("common.operationFailed"));
    await refreshState();
  } finally {
    busyAction.value = "";
  }
}

async function cancelPreparation() {
  const sessionId = preparation.value?.sessionId;
  if (!sessionId) return;
  await runAction(
    "cancel",
    () => api.cancelPreparation(sessionId),
    { refreshOnError: true },
  );
}

async function returnToIdle() {
  await runAction("idle", () => api.startSystemIdle());
}

async function stopGame() {
  if (!window.confirm(t("touch.stopConfirm"))) return;
  await runAction("stop", () => api.stopTouchGame());
}
</script>

<template>
  <main class="touch-shell" :data-state="view">
    <TouchMatrixCanvas
      v-if="view !== 'PREPARING' && (view !== 'IDLE' || idleVideoFailed)"
      :mode="statusCanvasMode"
    />

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

    <section v-if="loadingState" class="touch-center touch-status-panel" aria-live="polite">
      <span class="touch-kicker">LED GAME TOUCH</span>
      <h1>{{ t("touch.connecting") }}</h1>
    </section>

    <button
      v-else-if="view === 'IDLE'"
      class="touch-idle-action"
      type="button"
      :disabled="Boolean(busyAction)"
      @click="wakeTouch"
    >
      <span class="touch-kicker">LED GAME TOUCH</span>
      <strong>{{ t(busyAction === "wake" ? "touch.waking" : "touch.tapToStart") }}</strong>
      <small>{{ t("touch.idleHint") }}</small>
    </button>

    <section v-else-if="view === 'PREPARING'" class="touch-preparing">
      <header class="touch-preparing-header">
        <div>
          <span class="touch-kicker">PREPARING</span>
          <h1>{{ t("touch.chooseGame") }}</h1>
        </div>
        <button class="touch-text-button" type="button" :disabled="Boolean(busyAction)" @click="cancelPreparation">
          {{ t("touch.returnIdle") }}
        </button>
      </header>

      <div class="touch-preparing-body">
        <section class="touch-game-browser" :aria-label="t('touch.gameList')">
          <div v-if="loadingGames" class="touch-empty">{{ t("touch.loadingGames") }}...</div>
          <div v-else-if="!games.length" class="touch-empty">
            <strong>{{ t("touch.noGames") }}</strong>
            <button class="touch-secondary-button" type="button" @click="loadGames">{{ t("touch.reload") }}</button>
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
              <img v-if="coverUrls[game.id]" :src="coverUrls[game.id]" :alt="game.name" />
              <span v-else class="touch-cover-fallback">{{ game.name.slice(0, 1) }}</span>
              <span class="touch-game-copy">
                <strong>{{ game.name }}</strong>
                <small>{{ game.type || game.mode || "Game" }}</small>
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
            <input v-model.number="draft.userCount" type="number" min="1" max="32" :disabled="!selectedGameId || Boolean(busyAction)" />
          </label>

          <label class="touch-field">
            <span>{{ t("touch.startLevel") }}</span>
            <input v-model.number="draft.startLevelIndex" type="number" min="0" :disabled="!selectedGameId || Boolean(busyAction)" />
          </label>

          <fieldset class="touch-fieldset" :disabled="!selectedGameId || Boolean(busyAction)">
            <legend>{{ t("touch.afterFailure") }}</legend>
            <div class="touch-segmented">
              <button type="button" :class="{ active: draft.stageFailurePolicy === 'END_GAME' }" @click="draft.stageFailurePolicy = 'END_GAME'">{{ t("touch.endGame") }}</button>
              <button type="button" :class="{ active: draft.stageFailurePolicy === 'RETRY' }" @click="draft.stageFailurePolicy = 'RETRY'">{{ t("touch.retryLevel") }}</button>
            </div>
          </fieldset>

          <div class="touch-config-actions">
            <button class="touch-secondary-button" type="button" :disabled="!canConfirm || Boolean(busyAction)" @click="savePreparation">
              {{ t("touch.saveConfig") }}
            </button>
            <button class="touch-primary-button" type="button" :disabled="!canConfirm || Boolean(busyAction)" @click="confirmPreparation">
              {{ t(busyAction === "confirm" ? "touch.starting" : "touch.startGame") }}
            </button>
          </div>
        </aside>
      </div>
    </section>

    <section v-else-if="view === 'STARTING'" class="touch-center touch-status-panel">
      <span class="touch-kicker">STARTING</span>
      <h1>{{ t("touch.gameStarting", { game: runtimeState.gameName || t("touch.gameFallback") }) }}</h1>
      <p>{{ t("touch.startingHint") }}</p>
    </section>

    <section v-else-if="view === 'RUNNING'" class="touch-center touch-status-panel">
      <span class="touch-kicker">RUNNING</span>
      <h1>{{ runtimeState.gameName || t("touch.gameRunning") }}</h1>
      <div class="touch-live-stats">
        <span>{{ t("touch.score") }} <strong>{{ gameplay.score ?? 0 }}</strong></span>
        <span>{{ t("touch.life") }} <strong>{{ gameplay.life ?? "-" }}</strong></span>
      </div>
      <button class="touch-danger-button" type="button" :disabled="Boolean(busyAction)" @click="stopGame">{{ t("touch.stopGame") }}</button>
    </section>

    <section v-else-if="view === 'SETTLING'" class="touch-center touch-status-panel">
      <span class="touch-kicker">SETTLING</span>
      <h1>{{ t("touch.settling") }}</h1>
      <p>{{ t("touch.pleaseWait") }}</p>
    </section>

    <section v-else-if="view === 'STOPPED'" class="touch-center touch-status-panel">
      <span class="touch-kicker">GAME OVER</span>
      <h1 v-if="terminated">{{ t(resultSucceeded ? "touch.challengeComplete" : "touch.gameEnded") }}</h1>
      <h1 v-else>{{ t("touch.readyForGame") }}</h1>
      <div v-if="terminated" class="touch-result-score">{{ gameplay.score ?? 0 }}</div>
      <button class="touch-primary-button" type="button" :disabled="Boolean(busyAction)" @click="returnToIdle">
        {{ t(busyAction === "idle" ? "touch.returning" : "touch.returnIdle") }}
      </button>
    </section>

    <section v-else class="touch-center touch-status-panel">
      <span class="touch-kicker">CONNECTION</span>
      <h1>{{ t("touch.waitingState") }}</h1>
      <button class="touch-secondary-button" type="button" @click="refreshState">{{ t("touch.reconnect") }}</button>
    </section>

    <div v-if="errorMessage" class="touch-error" role="alert">
      <span>{{ errorMessage }}</span>
      <button type="button" @click="errorMessage = ''">{{ t("common.close") }}</button>
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

.touch-idle-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #071018;
}

.touch-idle-action strong {
  margin-top: 12px;
  font-size: 44px;
}

.touch-idle-action small {
  margin-top: 12px;
  color: #c5d5df;
  font-size: 17px;
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

@media (max-width: 760px) {
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
  .touch-idle-action strong {
    font-size: 34px;
  }
}
</style>
