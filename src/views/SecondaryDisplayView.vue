<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { normalizeRuntimeState } from "../lib/gameFlowState.js";
import {
  createSecondaryDisplayPresentation,
  SECONDARY_DISPLAY_MODES,
} from "../lib/secondaryDisplayPresentation.js";
import stageSuccessImage from "../assets/secondary-display/stage-success.png";
import stageFailureImage from "../assets/secondary-display/stage-failure.png";
import gameSuccessImage from "../assets/secondary-display/game-success.png";
import gameFailureImage from "../assets/secondary-display/game-failure.png";

const { t } = useI18n();
const api = window.ledGame;
const runtimeState = ref(normalizeRuntimeState(null));
const loading = ref(true);
const errorMessage = ref("");
const stateObservedAt = ref(Date.now());
const clockNow = ref(Date.now());
let removeStateListener = null;
let clockTimer = null;

const presentation = computed(() => createSecondaryDisplayPresentation(runtimeState.value, {
  observedAt: stateObservedAt.value,
  now: clockNow.value,
}));
const gameplay = computed(() => presentation.value.state.gameplay || {});
const lifecycle = computed(() => presentation.value.state.engineState);
const isResultVisible = computed(() => presentation.value.mode !== SECONDARY_DISPLAY_MODES.HUD);
const isGameResult = computed(() => [
  SECONDARY_DISPLAY_MODES.GAME_SUCCESS,
  SECONDARY_DISPLAY_MODES.GAME_FAILURE,
].includes(presentation.value.mode));
const gameTimeText = computed(() => presentation.value.gameTime.mode === "UNLIMITED"
  ? t("secondaryDisplay.unlimited")
  : presentation.value.gameTime.text);

function applyRuntimeState(state) {
  const observedAt = Date.now();
  runtimeState.value = normalizeRuntimeState(state);
  stateObservedAt.value = observedAt;
  clockNow.value = observedAt;
}

const resultVisual = computed(() => {
  switch (presentation.value.mode) {
    case SECONDARY_DISPLAY_MODES.STAGE_SUCCESS:
      return { title: t("secondaryDisplay.stageSuccess"), image: stageSuccessImage, tone: "success" };
    case SECONDARY_DISPLAY_MODES.STAGE_FAILURE:
      return {
        title: t("secondaryDisplay.stageFailure"),
        subtitle: presentation.value.retrying ? t("secondaryDisplay.retrying") : "",
        image: stageFailureImage,
        tone: "failure",
      };
    case SECONDARY_DISPLAY_MODES.GAME_SUCCESS:
      return { title: t("secondaryDisplay.gameSuccess"), image: gameSuccessImage, tone: "success" };
    case SECONDARY_DISPLAY_MODES.GAME_FAILURE:
      return { title: t("secondaryDisplay.gameFailure"), image: gameFailureImage, tone: "failure" };
    default:
      return {
        title: t("secondaryDisplay.states.SETTLING"),
        subtitle: t("secondaryDisplay.settlingHint"),
        image: null,
        tone: "neutral",
      };
  }
});

onMounted(async () => {
  removeStateListener = api?.onEngineState?.((state) => {
    applyRuntimeState(state);
  });
  clockTimer = window.setInterval(() => {
    clockNow.value = Date.now();
  }, 250);
  if (!api?.touchGameState) {
    loading.value = false;
    errorMessage.value = t("secondaryDisplay.runtimeUnavailable");
    return;
  }
  try {
    applyRuntimeState(await api.touchGameState());
  } catch (error) {
    errorMessage.value = error?.message || t("secondaryDisplay.runtimeReadFailed");
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  removeStateListener?.();
  if (clockTimer) window.clearInterval(clockTimer);
});

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : value;
}
</script>

<template>
  <main class="secondary-runtime" :data-state="lifecycle">
    <div class="secondary-runtime-grid" aria-hidden="true"></div>

    <section v-if="loading" class="secondary-runtime-center" aria-live="polite">
      <span>LED GAME</span>
      <h1>{{ t("common.loading") }}</h1>
    </section>

    <section v-else-if="errorMessage" class="secondary-runtime-center secondary-runtime-error">
      <span>CONNECTION</span>
      <h1>{{ t("secondaryDisplay.runtimeUnavailable") }}</h1>
      <p>{{ errorMessage }}</p>
    </section>

    <section v-else class="secondary-runtime-content">
      <header class="secondary-runtime-header">
        <div class="game-heading">
          <span>{{ t("secondaryDisplay.live") }}</span>
          <h1>{{ presentation.state.gameName || t("touch.gameFallback") }}</h1>
        </div>
        <div class="header-status">
          <div v-if="presentation.gameTime.visible" class="game-time-label">
            <span>{{ t("secondaryDisplay.gameRemaining") }}</span>
            <strong>{{ gameTimeText }}</strong>
          </div>
          <div class="stage-label">
            <span>{{ t("secondaryDisplay.currentStage") }}</span>
            <strong>{{ displayValue(presentation.stageNumber) }}</strong>
          </div>
          <strong class="lifecycle-label">{{ t(`secondaryDisplay.states.${lifecycle}`) }}</strong>
        </div>
      </header>

      <section class="secondary-runtime-main" :class="{ 'is-obscured': isResultVisible }">
        <section v-if="presentation.isRank" class="rank-scoreboard">
          <div class="rank-round-summary">
            <span>{{ t("rankSecondary.round", { value: displayValue(gameplay.roundId) }) }}</span>
            <span>{{ t("rankSecondary.remainingTargets", { value: displayValue(gameplay.remainingTargets) }) }}</span>
            <span>{{ t("rankSecondary.roundRemainingTime", { value: displayValue(presentation.rankRemainingTimeText) }) }}</span>
          </div>
          <div class="rank-player-grid">
            <article
              v-for="player in presentation.rankPlayers"
              :key="player.playerNumber"
              class="rank-player-card"
              :style="{ '--player-color': player.color || '#38a4d8' }"
            >
              <header>
                <strong>{{ player.playerNumber }}P</strong>
                <span>{{ player.tied ? t("rankSecondary.tiedRank", { value: player.rank }) : t("rankSecondary.rank", { value: player.rank }) }}</span>
              </header>
              <div><span>{{ t("rankSecondary.stageScore") }}</span><strong>{{ displayValue(player.stageScore) }}</strong></div>
              <div><span>{{ t("rankSecondary.totalScore") }}</span><strong>{{ displayValue(player.totalScore) }}</strong></div>
              <div><span>{{ t("secondaryDisplay.memberPoints") }}</span><strong>{{ displayValue(player.memberPoints) }}</strong></div>
            </article>
          </div>
        </section>

        <section v-else class="shared-hud" :class="{ 'has-life': presentation.life !== null }">
          <article class="hud-stat hud-stage">
            <span>{{ t("secondaryDisplay.currentStage") }}</span>
            <strong>{{ displayValue(presentation.stageNumber) }}</strong>
          </article>
          <article class="hud-stat hud-score">
            <span>{{ t("secondaryDisplay.score") }}</span>
            <strong>{{ displayValue(presentation.score) }}</strong>
          </article>
          <article class="hud-stat hud-member-points">
            <span>{{ t("secondaryDisplay.memberPoints") }}</span>
            <strong>{{ displayValue(presentation.memberPoints) }}</strong>
          </article>
          <article
            v-if="presentation.life !== null"
            class="hud-stat hud-life"
          >
            <span class="sr-only">{{ t("secondaryDisplay.life") }} {{ presentation.life }}</span>
            <span>{{ t("secondaryDisplay.life") }}</span>
            <strong>{{ presentation.life }}</strong>
            <p class="life-hearts" aria-hidden="true">{{ presentation.hearts }}</p>
          </article>
        </section>
      </section>

      <section
        v-if="isResultVisible"
        :key="presentation.mode"
        class="result-layer"
        :class="`result-${resultVisual.tone}`"
        aria-live="assertive"
      >
        <div v-if="!resultVisual.image" class="settling-orbit" aria-hidden="true"></div>
        <img v-else :src="resultVisual.image" alt="" class="result-art" />
        <div class="result-copy">
          <span v-if="presentation.stageNumber !== null">
            {{ t("secondaryDisplay.currentStage") }} {{ presentation.stageNumber }}
          </span>
          <h2>{{ resultVisual.title }}</h2>
          <p v-if="resultVisual.subtitle">{{ resultVisual.subtitle }}</p>
          <p v-if="isGameResult && presentation.score !== null" class="final-score">
            {{ t("secondaryDisplay.finalScore", { score: presentation.score }) }}
          </p>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.secondary-runtime { position: relative; width: 100vw; height: 100vh; overflow: hidden; color: #f5f8fb; background: #071019; user-select: none; }
.secondary-runtime::before { content: ""; position: absolute; inset: 0 0 auto; height: 7px; background: #26b9d6; box-shadow: 0 0 24px rgba(38, 185, 214, 0.5); }
.secondary-runtime-grid { position: absolute; inset: 0; opacity: 0.18; background-image: linear-gradient(rgba(105, 166, 197, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(105, 166, 197, 0.16) 1px, transparent 1px); background-size: 52px 52px; }
.secondary-runtime-content, .secondary-runtime-center { position: relative; z-index: 1; }
.secondary-runtime-center { height: 100%; display: grid; place-content: center; gap: 12px; padding: 6vh 7vw; text-align: center; }
.secondary-runtime-center span, .game-heading > span { color: #63cde1; font-weight: 850; text-transform: uppercase; }
.secondary-runtime-center h1, .secondary-runtime-center p { margin: 0; }
.secondary-runtime-content { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: clamp(18px, 3vh, 42px); padding: clamp(28px, 5vh, 66px) clamp(32px, 5vw, 88px); }
.secondary-runtime-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 30px; }
.game-heading { min-width: 0; }
.game-heading h1 { max-width: 58vw; overflow: hidden; margin: 7px 0 0; font-size: clamp(34px, 4.5vw, 72px); line-height: 1.05; text-overflow: ellipsis; white-space: nowrap; }
.header-status { display: flex; align-items: stretch; gap: 12px; }
.stage-label, .game-time-label, .lifecycle-label { border: 1px solid #315672; border-radius: 6px; background: #102535; }
.stage-label { display: flex; align-items: baseline; gap: 12px; padding: 9px 16px; }
.stage-label span, .game-time-label span { color: #93b5c8; font-weight: 700; }
.stage-label strong, .game-time-label strong { color: #f4cf64; font-size: clamp(24px, 2.4vw, 40px); }
.game-time-label { display: grid; align-content: center; gap: 2px; min-width: 150px; padding: 7px 16px; }
.game-time-label strong { color: #7be2f3; font-variant-numeric: tabular-nums; }
.lifecycle-label { display: grid; place-items: center; padding: 10px 17px; color: #9ed8f4; }
.secondary-runtime-main { min-height: 0; transition: opacity 220ms ease, filter 220ms ease; }
.secondary-runtime-main.is-obscured { opacity: 0.18; filter: saturate(0.5); }
.shared-hud { height: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(18px, 2.5vw, 42px); align-items: stretch; }
.shared-hud.has-life { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.hud-stat { min-width: 0; display: grid; align-content: center; gap: 12px; padding: clamp(24px, 4vw, 58px); border-top: 8px solid #2ebad5; border-radius: 6px; background: rgba(12, 28, 41, 0.94); }
.hud-stat > span { color: #9fb4c2; font-size: clamp(19px, 1.8vw, 30px); font-weight: 800; }
.hud-stat > strong { overflow: hidden; font-size: clamp(70px, 10vw, 164px); line-height: 0.95; text-overflow: ellipsis; }
.hud-stage { border-color: #f2c95e; }
.hud-stage > strong { color: #ffe191; }
.hud-member-points { border-color: #48d99c; }
.hud-member-points > strong { color: #8cf1c5; }
.hud-life { border-color: #ea5a77; }
.hud-life > strong { color: #ff9caf; }
.life-hearts { max-height: 30vh; overflow: hidden; margin: 8px 0 0; color: #ff5578; font-size: clamp(30px, 3.7vw, 62px); line-height: 1.05; overflow-wrap: anywhere; text-shadow: 0 0 18px rgba(255, 77, 116, 0.42); }
.rank-scoreboard { height: 100%; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 2.2vh; }
.rank-round-summary { display: flex; flex-wrap: wrap; gap: 12px 28px; color: #9ed8f4; font-size: clamp(16px, 1.5vw, 25px); font-weight: 750; }
.rank-player-grid { min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(10px, 1.4vw, 22px); }
.rank-player-card { min-width: 0; overflow: hidden; padding: clamp(14px, 1.8vw, 26px); border-top: 7px solid var(--player-color); border-radius: 5px; background: #0c1c29; }
.rank-player-card header, .rank-player-card > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.rank-player-card header { margin-bottom: 1.5vh; color: var(--player-color); }
.rank-player-card header strong { font-size: clamp(28px, 2.8vw, 50px); }
.rank-player-card > div span { color: #a4b5c2; font-weight: 700; }
.rank-player-card > div strong { font-size: clamp(29px, 3.5vw, 62px); }
.result-layer { position: absolute; z-index: 4; inset: clamp(115px, 17vh, 190px) clamp(32px, 5vw, 88px) clamp(28px, 5vh, 66px); display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(320px, 1.2fr); align-items: center; gap: clamp(20px, 4vw, 72px); overflow: hidden; border-block: 1px solid rgba(99, 205, 225, 0.38); background: rgba(6, 18, 28, 0.91); animation: result-enter 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.result-layer::before { content: ""; position: absolute; inset: 0; border-left: 10px solid #54cce3; pointer-events: none; animation: result-emphasis 2.8s ease-in-out infinite; }
.result-success::before { border-left-color: #48d99c; }
.result-failure::before { border-left-color: #f05e7a; }
.result-art { width: min(38vw, 48vh, 460px); height: min(38vw, 48vh, 460px); justify-self: end; object-fit: contain; filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.35)); }
.result-copy { min-width: 0; padding-right: clamp(20px, 5vw, 80px); }
.result-copy > span { color: #8bc9dc; font-size: clamp(18px, 1.8vw, 30px); font-weight: 800; }
.result-copy h2 { margin: 12px 0 0; font-size: clamp(56px, 7vw, 116px); line-height: 1; }
.result-success .result-copy h2 { color: #8cf1c5; }
.result-failure .result-copy h2 { color: #ff9caf; }
.result-copy p { margin: 20px 0 0; color: #c6d4dc; font-size: clamp(22px, 2.4vw, 42px); font-weight: 700; }
.result-copy .final-score { color: #ffe191; font-size: clamp(28px, 3vw, 50px); }
.settling-orbit { width: min(28vw, 34vh, 320px); aspect-ratio: 1; justify-self: end; border: clamp(12px, 1.2vw, 20px) solid #183f52; border-top-color: #66d6e9; border-radius: 50%; box-shadow: inset 0 0 30px rgba(102, 214, 233, 0.15), 0 0 30px rgba(102, 214, 233, 0.18); animation: settling-spin 1.8s linear infinite; }
.secondary-runtime-error { color: #ffbdc2; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@keyframes result-enter { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
@keyframes result-emphasis { 0%, 100% { box-shadow: inset 12px 0 28px rgba(84, 204, 227, 0.08); } 50% { box-shadow: inset 20px 0 46px rgba(84, 204, 227, 0.22); } }
@keyframes settling-spin { to { transform: rotate(360deg); } }
@media (max-width: 1000px), (max-aspect-ratio: 4 / 3) {
  .secondary-runtime-content { padding-inline: 4vw; }
  .game-heading h1 { max-width: 48vw; }
  .header-status { flex-direction: column; }
  .shared-hud, .shared-hud.has-life { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hud-life { grid-column: 1 / -1; grid-template-columns: auto 1fr; }
  .hud-life .life-hearts { grid-column: 1 / -1; }
  .rank-player-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .result-layer { inset-inline: 4vw; grid-template-columns: minmax(180px, 0.7fr) minmax(260px, 1.3fr); }
}
@media (prefers-reduced-motion: reduce) {
  .secondary-runtime-main, .result-layer, .result-layer::before, .settling-orbit { transition: none; animation: none; }
}
</style>
