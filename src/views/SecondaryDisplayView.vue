<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { hasTermination, normalizeRuntimeState } from "../lib/gameFlowState.js";

const { t } = useI18n();
const api = window.ledGame;
const runtimeState = ref(normalizeRuntimeState(null));
const loading = ref(true);
const errorMessage = ref("");
let removeStateListener = null;

const gameplay = computed(() => runtimeState.value.gameplay || {});
const lifecycle = computed(() => runtimeState.value.engineState);
const terminated = computed(() => hasTermination(runtimeState.value));
const resultLabel = computed(() =>
  runtimeState.value.success === true
    ? t("secondaryDisplay.success")
    : t("secondaryDisplay.failure"),
);

onMounted(async () => {
  removeStateListener = api?.onEngineState?.((state) => {
    runtimeState.value = normalizeRuntimeState(state);
  });
  if (!api?.touchGameState) {
    loading.value = false;
    errorMessage.value = t("secondaryDisplay.runtimeUnavailable");
    return;
  }
  try {
    const result = await api.touchGameState();
    runtimeState.value = normalizeRuntimeState(result);
  } catch (error) {
    errorMessage.value = error?.message || t("secondaryDisplay.runtimeReadFailed");
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  removeStateListener?.();
});

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : value;
}
</script>

<template>
  <main class="secondary-runtime" :data-state="lifecycle">
    <div class="secondary-runtime-accent" aria-hidden="true"></div>

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
      <header>
        <div>
          <span>{{ t("secondaryDisplay.live") }}</span>
          <h1>{{ runtimeState.gameName || t("touch.gameFallback") }}</h1>
        </div>
        <strong>{{ t(`secondaryDisplay.states.${lifecycle}`) }}</strong>
      </header>

      <div class="secondary-runtime-stats">
        <article>
          <span>{{ t("touch.score") }}</span>
          <strong>{{ displayValue(gameplay.score) }}</strong>
        </article>
        <article>
          <span>{{ t("touch.life") }}</span>
          <strong>{{ displayValue(gameplay.life) }}</strong>
        </article>
      </div>

      <div class="secondary-runtime-stage">
        <span>{{ t("secondaryDisplay.phase") }}</span>
        <strong>{{ displayValue(gameplay.phase || lifecycle) }}</strong>
      </div>

      <section v-if="lifecycle === 'STOPPED' && terminated" class="secondary-runtime-result">
        <span>{{ t("secondaryDisplay.result") }}</span>
        <strong>{{ resultLabel }}</strong>
        <p>{{ t("secondaryDisplay.finalScore", { score: displayValue(gameplay.score) }) }}</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.secondary-runtime {
  position: relative;
  width: 100vw;
  min-height: 100vh;
  overflow: hidden;
  color: #f4f8fb;
  background: #07121c;
  touch-action: manipulation;
}

.secondary-runtime::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(125, 179, 218, 0.15) 1px, transparent 1px),
    linear-gradient(90deg, rgba(125, 179, 218, 0.15) 1px, transparent 1px);
  background-size: 54px 54px;
}

.secondary-runtime-accent {
  position: absolute;
  inset: 0 0 auto;
  height: 8px;
  background: #38a4d8;
}

.secondary-runtime-content,
.secondary-runtime-center {
  position: relative;
  z-index: 1;
}

.secondary-runtime-center {
  min-height: 100vh;
  display: grid;
  place-content: center;
  gap: 12px;
  padding: 8vh 8vw;
  text-align: center;
}

.secondary-runtime-center span,
.secondary-runtime-content header span,
.secondary-runtime-result > span {
  color: #67bce5;
  font-weight: 800;
}

.secondary-runtime-center h1,
.secondary-runtime-center p {
  margin: 0;
}

.secondary-runtime-content {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 5vh;
  padding: 7vh 7vw;
}

.secondary-runtime-content header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 30px;
}

.secondary-runtime-content h1 {
  max-width: 65vw;
  margin: 8px 0 0;
  font-size: clamp(34px, 5vw, 78px);
}

.secondary-runtime-content header > strong {
  padding: 12px 18px;
  border: 1px solid #315672;
  border-radius: 6px;
  color: #9ed8f4;
  background: #102535;
}

.secondary-runtime-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4vw;
  align-items: center;
}

.secondary-runtime-stats article {
  display: grid;
  gap: 12px;
  padding: 4vh 4vw;
  border-left: 7px solid #38a4d8;
  background: #0c1c29;
}

.secondary-runtime-stats span,
.secondary-runtime-stage span {
  color: #a4b5c2;
  font-size: clamp(18px, 2vw, 30px);
  font-weight: 700;
}

.secondary-runtime-stats strong {
  overflow: hidden;
  font-size: clamp(64px, 13vw, 200px);
  line-height: 0.95;
  text-overflow: ellipsis;
}

.secondary-runtime-stage {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 20px;
  padding-top: 3vh;
  border-top: 1px solid #284153;
}

.secondary-runtime-stage strong {
  font-size: clamp(24px, 3vw, 48px);
}

.secondary-runtime-result {
  position: absolute;
  inset: 50% auto auto 50%;
  width: min(760px, 80vw);
  display: grid;
  gap: 16px;
  padding: 42px;
  transform: translate(-50%, -50%);
  border: 1px solid #3c6680;
  border-radius: 8px;
  background: #0b1b27;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
  text-align: center;
}

.secondary-runtime-result strong {
  font-size: clamp(52px, 7vw, 110px);
}

.secondary-runtime-result p {
  margin: 0;
  color: #c1d1dc;
  font-size: clamp(24px, 3vw, 46px);
}

.secondary-runtime-error {
  color: #ffbdc2;
}
</style>
