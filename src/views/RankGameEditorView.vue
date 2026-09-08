<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { extractErrorMessage } from "../lib/gameFlowState.js";
import { createRankEditorPayload } from "../lib/rankGameEditor.js";
import { confirmWithRendererFocus } from "../lib/rendererFocus.js";

const props = defineProps({
  gameId: { type: [Number, String], required: true },
  gameName: { type: String, default: "" },
});
const emit = defineEmits(["back"]);
const { t } = useI18n({ useScope: "global" });
const api = window.ledGame;
const document = ref(null);
const loading = ref(true);
const busy = ref(null);
const errorMessage = ref("");
const statusMessage = ref("");
const validationErrors = ref([]);
const dirty = ref(false);
const testDialogOpen = ref(false);
const testOptions = ref({ userCount: 2, stageFailurePolicy: "END_GAME" });
let hydrating = false;

const type1Config = computed(() => document.value?.levels?.[0] || null);
const invalidConfiguration = computed(() => {
  const levels = document.value?.levels;
  return !Array.isArray(levels) || levels.length !== 1 || Number(levels[0]?.type) !== 1;
});
const canSave = computed(() => Boolean(document.value) && !Boolean(busy.value) && !invalidConfiguration.value);
const validTestPlayerCount = computed(() => {
  const count = Number(testOptions.value.userCount);
  return Number.isInteger(count)
    && count >= Number(document.value?.minPlayers)
    && count <= Number(document.value?.maxPlayers);
});
const saveLabel = computed(() => t(busy.value === "save" ? "rank.saving" : "rank.save"));

onMounted(load);
watch(document, () => {
  if (!hydrating && document.value) {
    dirty.value = true;
    validationErrors.value = [];
  }
}, { deep: true });

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await api.getRankGameEditor(props.gameId);
    hydrating = true;
    document.value = normalizeDocument(result?.data ?? result);
    testOptions.value.userCount = Math.min(2, document.value.maxPlayers || 1);
    dirty.value = false;
  } catch (error) {
    errorMessage.value = extractErrorMessage(error, t("rank.loadFailed"));
  } finally {
    hydrating = false;
    loading.value = false;
  }
}

function normalizeDocument(value) {
  const source = value && typeof value === "object" ? structuredClone(value) : {};
  source.palette = Array.isArray(source.palette) ? source.palette : [];
  source.levels = Array.isArray(source.levels) ? source.levels : [];
  for (const level of source.levels) {
    level.bounds ||= { minX: 0, minY: 0, maxX: (source.siteSizeWidth || 16) - 1, maxY: (source.siteSizeHeight || 36) - 1 };
    level.rewardPoints = Number.isInteger(Number(level.rewardPoints)) && Number(level.rewardPoints) >= 0 ? Number(level.rewardPoints) : 0;
  }
  return source;
}

async function validate() {
  if (!document.value || busy.value) return null;
  busy.value = "validate";
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    const payload = createRankEditorPayload(document.value, props.gameId);
    const result = await api.validateRankGameEditor(payload);
    const validation = result?.data ?? result;
    if (!validation?.valid) {
      validationErrors.value = validation?.errors || [];
      const first = validation?.errors?.[0];
      await focusValidationError(first);
      throw new Error(first ? `${first.path}: ${first.message}` : t("rank.validationFailed"));
    }
    validationErrors.value = [];
    statusMessage.value = t("rank.validationPassed");
    return validation;
  } catch (error) {
    errorMessage.value = extractErrorMessage(error, t("rank.validationFailed"));
    return null;
  } finally {
    busy.value = null;
  }
}

async function save() {
  if (!canSave.value) return;
  busy.value = "save";
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    const payload = createRankEditorPayload(document.value, props.gameId);
    const validationResult = await api.validateRankGameEditor(payload);
    const validation = validationResult?.data ?? validationResult;
    if (!validation?.valid) {
      validationErrors.value = validation?.errors || [];
      const first = validation?.errors?.[0];
      await focusValidationError(first);
      throw new Error(first ? `${first.path}: ${first.message}` : t("rank.validationFailed"));
    }
    validationErrors.value = [];
    await api.saveRankGameEditor(props.gameId, payload);
    dirty.value = false;
    statusMessage.value = t("rank.saved");
  } catch (error) {
    errorMessage.value = extractErrorMessage(error, t("rank.saveFailed"));
  } finally {
    busy.value = null;
  }
}

async function saveBeforeStart() {
  const payload = createRankEditorPayload(document.value, props.gameId);
  const validationResult = await api.validateRankGameEditor(payload);
  const validation = validationResult?.data ?? validationResult;
  if (!validation?.valid) {
    validationErrors.value = validation?.errors || [];
    const first = validation?.errors?.[0];
    await focusValidationError(first);
    throw new Error(first ? `${first.path}: ${first.message}` : t("rank.validationFailed"));
  }
  validationErrors.value = [];
  await api.saveRankGameEditor(props.gameId, payload);
  dirty.value = false;
}

async function focusValidationError(error) {
  const path = error?.path || "";
  await nextTick();
  const field = validationField(path);
  globalThis.document?.querySelector(`[data-rank-field="${field}"]`)?.focus?.();
}

function validationField(path) {
  return String(path || "")
    .replace(/^levels\[\d+]/, "level")
    .replace(/\.targetsPerPlayer$/, ".targetsPerPlayerMin")
    .replace(/\.bombs$/, ".bombMin")
    .replace(/\.bombWarning$/, ".bombWarningDelaySeconds")
    .replace(/\.capacity$/, ".bounds")
    .replace(/^players$/, "minPlayers")
    .replace(/^palette(?:\[\d+])?$/, "palette");
}

async function exportJson() {
  if (!document.value || !api?.exportFrameJson) return;
  const result = await api.exportFrameJson({
    content: JSON.stringify(document.value, null, 2),
    defaultFileName: `${document.value.name || "rank-type1"}.json`,
  });
  if (!result?.canceled) statusMessage.value = t("rank.exported");
}

async function importJson() {
  if (!api?.importFrameJson || busy.value) return;
  try {
    const result = await api.importFrameJson();
    if (result?.canceled) return;
    const parsed = JSON.parse(result.content || "");
    if (parsed?.type !== "rank") throw new Error(t("rank.invalidImport"));
    hydrating = true;
    document.value = normalizeDocument({ ...parsed, id: Number(props.gameId) });
    hydrating = false;
    dirty.value = true;
  } catch (error) {
    hydrating = false;
    errorMessage.value = extractErrorMessage(error, t("rank.invalidImport"));
  }
}

async function startTest() {
  if (!document.value || busy.value) return;
  busy.value = "start";
  errorMessage.value = "";
  try {
    if (dirty.value) await saveBeforeStart();
    await api.startGame({
      id: Number(props.gameId),
      userCount: Number(testOptions.value.userCount),
      startLevelIndex: 0,
      stageFailurePolicy: testOptions.value.stageFailurePolicy,
      launchMethod: "debug",
      runtimeMode: "SIMULATION",
    });
    await api.openDebugPanel?.();
    testDialogOpen.value = false;
    statusMessage.value = t("rank.started");
  } catch (error) {
    errorMessage.value = extractErrorMessage(error, t("rank.startFailed"));
  } finally {
    busy.value = null;
  }
}

function goBack() {
  if (dirty.value && !confirmWithRendererFocus(t("rank.confirmLeave"))) return;
  emit("back");
}
</script>

<template>
  <section class="rank-editor workspace">
    <header class="rank-toolbar">
      <div class="rank-title">
        <button class="icon-action" type="button" v-bind="{ title: t('rank.back') }" @click="goBack">←</button>
        <div><span>{{ t("rank.typeLabel") }}</span><h1>{{ document?.displayName || gameName }}</h1></div>
      </div>
      <div class="rank-actions">
        <button class="soft-button" type="button" :disabled="!document || Boolean(busy)" @click="importJson">{{ t("rank.import") }}</button>
        <button class="soft-button" type="button" :disabled="!document || Boolean(busy)" @click="exportJson">{{ t("rank.export") }}</button>
        <button class="soft-button" type="button" :disabled="!document || Boolean(busy)" @click="validate">{{ t("rank.validate") }}</button>
        <button class="soft-button" type="button" :disabled="!document || Boolean(busy) || invalidConfiguration" @click="testDialogOpen = true">{{ t("rank.startTest") }}</button>
        <button class="action-button primary" type="button" :disabled="!canSave" @click="save">{{ saveLabel }}</button>
      </div>
    </header>

    <p v-if="statusMessage" class="status-line">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="error-line" role="alert">{{ errorMessage }}</p>
    <ul v-if="validationErrors.length" class="rank-validation-errors">
      <li v-for="error in validationErrors" :key="`${error.path}:${error.message}`">
        <button type="button" @click="focusValidationError(error)"><strong>{{ error.path }}</strong> {{ error.message }}</button>
      </li>
    </ul>
    <div v-if="loading" class="editor-loading">{{ t("common.loading") }}</div>

    <div v-else-if="document" class="rank-workspace">
      <aside class="rank-settings">
        <section>
          <h2>{{ t("rank.basicInfo") }}</h2>
          <label><span>{{ t("rank.internalName") }}</span><input v-model.trim="document.name" data-rank-field="name" /></label>
          <label><span>{{ t("rank.displayName") }}</span><input v-model.trim="document.displayName" /></label>
          <label><span>{{ t("rank.description") }}</span><textarea v-model="document.description" rows="3"></textarea></label>
          <label><span>{{ t("rank.cover") }}</span><input v-model.trim="document.cover" /></label>
          <div class="field-pair">
            <label><span>{{ t("rank.width") }}</span><input v-model.number="document.siteSizeWidth" data-rank-field="siteSizeWidth" type="number" min="1" max="128" /></label>
            <label><span>{{ t("rank.height") }}</span><input v-model.number="document.siteSizeHeight" data-rank-field="siteSizeHeight" type="number" min="1" max="128" /></label>
          </div>
          <div class="field-pair">
            <label><span>{{ t("rank.minPlayers") }}</span><input v-model.number="document.minPlayers" data-rank-field="minPlayers" type="number" min="1" max="6" /></label>
            <label><span>{{ t("rank.maxPlayers") }}</span><input v-model.number="document.maxPlayers" type="number" min="1" max="6" /></label>
          </div>
          <label class="check-field"><input v-model="document.globalTimeLimit" type="checkbox" /><span>{{ t("rank.globalTimeLimit") }}</span></label>
          <label v-if="document.globalTimeLimit"><span>{{ t("rank.globalSeconds") }}</span><input v-model.number="document.globalTimeLimitValue" data-rank-field="globalTimeLimitValue" type="number" min="1" /></label>
        </section>

        <section>
          <h2>{{ t("rank.playerColors") }}</h2>
          <div class="palette-grid" data-rank-field="palette" tabindex="-1">
            <label v-for="(_, index) in document.palette" :key="index">
              <span>{{ index + 1 }}P</span><input v-model="document.palette[index]" type="color" />
            </label>
          </div>
        </section>
      </aside>

      <main class="rank-config-editor" data-rank-field="levels" tabindex="-1">
        <div v-if="invalidConfiguration" class="rank-unsupported">{{ t("rank.invalidConfiguration") }}</div>
        <section v-else-if="type1Config" class="rank-config-form" data-rank-field="level" tabindex="-1">
          <h2>{{ t("rank.levelConfig") }}</h2>
          <div class="form-grid">
            <label><span>{{ t("rank.duration") }}</span><input v-model.number="type1Config.durationSeconds" data-rank-field="level.durationSeconds" type="number" min="1" /></label>
            <label><span>{{ t('management.rankReward') }}</span><input v-model.number="type1Config.rewardPoints" data-rank-field="level.rewardPoints" type="number" min="0" max="1000000" step="1" /><small>{{ t('management.rankRewardHint') }}</small></label>
            <label><span>{{ t("rank.refreshSeconds") }}</span><input v-model.number="type1Config.refreshSeconds" type="number" min="1" /></label>
            <label data-rank-field="level.bounds" tabindex="-1"><span>{{ t("rank.minX") }}</span><input v-model.number="type1Config.bounds.minX" type="number" min="0" /></label>
            <label><span>{{ t("rank.maxX") }}</span><input v-model.number="type1Config.bounds.maxX" type="number" min="0" /></label>
            <label><span>{{ t("rank.minY") }}</span><input v-model.number="type1Config.bounds.minY" type="number" min="0" /></label>
            <label><span>{{ t("rank.maxY") }}</span><input v-model.number="type1Config.bounds.maxY" type="number" min="0" /></label>
            <label><span>{{ t("rank.targetMin") }}</span><input v-model.number="type1Config.targetsPerPlayerMin" data-rank-field="level.targetsPerPlayerMin" type="number" min="1" /></label>
            <label><span>{{ t("rank.targetMax") }}</span><input v-model.number="type1Config.targetsPerPlayerMax" type="number" min="1" /></label>
            <label><span>{{ t("rank.bombMin") }}</span><input v-model.number="type1Config.bombMin" data-rank-field="level.bombMin" type="number" min="0" /></label>
            <label><span>{{ t("rank.bombMax") }}</span><input v-model.number="type1Config.bombMax" type="number" min="0" /></label>
            <label><span>{{ t("rank.warningDelay") }}</span><input v-model.number="type1Config.bombWarningDelaySeconds" data-rank-field="level.bombWarningDelaySeconds" type="number" min="0" /></label>
            <label><span>{{ t("rank.warningDuration") }}</span><input v-model.number="type1Config.bombWarningDurationSeconds" type="number" min="1" /></label>
            <label class="check-field"><input v-model="type1Config.earlyRefresh" type="checkbox" /><span>{{ t("rank.earlyRefresh") }}</span></label>
          </div>
          <h2 class="media-heading">{{ t("rank.mediaConfig") }}</h2>
          <div class="form-grid">
            <label><span>{{ t("rank.backgroundVoice") }}</span><input v-model.trim="type1Config.backgroundVoice" /></label>
            <label><span>{{ t("rank.startGif") }}</span><input v-model.trim="type1Config.startGif" /></label>
            <label><span>{{ t("rank.warningAudio") }}</span><input v-model.trim="type1Config.bombWarningAudio" /></label>
            <label><span>{{ t("rank.explosionAudio") }}</span><input v-model.trim="type1Config.bombExplosionAudio" /></label>
          </div>
        </section>
      </main>
    </div>

    <div v-if="testDialogOpen" class="rank-dialog-backdrop" @mousedown.self="testDialogOpen = false">
      <section class="rank-dialog" role="dialog" aria-modal="true">
        <h2>{{ t("rank.startTest") }}</h2>
        <label><span>{{ t("rank.playerCount") }}</span><input v-model.number="testOptions.userCount" type="number" :min="document.minPlayers" :max="document.maxPlayers" /></label>
        <label><span>{{ t("rank.failurePolicy") }}</span><select v-model="testOptions.stageFailurePolicy"><option value="END_GAME">{{ t("rank.endGame") }}</option><option value="RETRY">{{ t("rank.retry") }}</option></select></label>
        <footer><button class="soft-button" type="button" @click="testDialogOpen = false">{{ t("common.cancel") }}</button><button class="action-button primary" type="button" :disabled="Boolean(busy) || !validTestPlayerCount" @click="startTest">{{ t("rank.start") }}</button></footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.rank-editor { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; padding-bottom: 18px; }
.rank-validation-errors { max-height: 92px; margin: 0; padding: 8px 12px; overflow-y: auto; border: 1px solid #efb6bc; border-radius: 5px; background: #fff2f3; list-style: none; }
.rank-validation-errors button { width: 100%; padding: 3px 0; border: 0; color: #8e2f3b; background: transparent; text-align: left; cursor: pointer; }
.rank-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; }
.rank-title, .rank-actions, .rank-dialog footer { display: flex; align-items: center; gap: 8px; }
.rank-title span { color: #1483a1; font-size: 10px; font-weight: 800; letter-spacing: .12em; }
.rank-title h1, .rank-toolbar h1, .rank-settings h2, .rank-config-editor h2 { margin: 0; }
.rank-title h1 { color: #263849; font-size: 21px; }
.rank-actions { flex-wrap: wrap; justify-content: flex-end; }
.rank-workspace { display: grid; grid-template-columns: minmax(240px, 290px) minmax(0, 1fr); gap: 10px; flex: 1; min-height: 0; }
.rank-settings, .rank-config-editor { min-height: 0; border: 1px solid #d3dce5; border-radius: 6px; background: #f8fafc; }
.rank-settings { overflow-y: auto; padding: 14px; }
.rank-settings section + section { margin-top: 20px; padding-top: 16px; border-top: 1px solid #dce4eb; }
.rank-settings h2, .rank-config-form h2 { color: #34495b; font-size: 14px; }
label { display: grid; gap: 5px; color: #5c6c7a; font-size: 11px; font-weight: 700; }
.rank-settings label { margin-top: 10px; }
input, textarea, select { min-width: 0; padding: 8px 9px; border: 1px solid #c9d4de; border-radius: 4px; color: #273746; background: white; font: inherit; font-weight: 500; outline: none; }
input:focus, textarea:focus, select:focus { border-color: #1597b8; box-shadow: 0 0 0 2px rgba(21, 151, 184, .12); }
.field-pair, .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.check-field { display: flex; align-items: center; gap: 8px; min-height: 34px; }
.check-field input { width: 16px; height: 16px; }
.palette-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
.palette-grid label { display: flex; align-items: center; justify-content: space-between; margin: 0; padding: 7px; border: 1px solid #d9e2e9; border-radius: 4px; background: white; }
.palette-grid input { width: 27px; height: 24px; padding: 1px; }
.rank-config-editor { overflow-y: auto; padding: 16px; }
.rank-config-form { max-width: 920px; }
.form-grid { margin-top: 12px; }
.media-heading { margin-top: 24px !important; padding-top: 18px; border-top: 1px solid #dce4eb; }
.icon-action { display: grid; place-items: center; min-width: 32px; height: 32px; border: 1px solid #cbd6df; border-radius: 4px; color: #526779; background: white; cursor: pointer; }
.icon-action:disabled { color: #aab4bc; background: #e8edf1; cursor: not-allowed; }
.icon-action.danger { color: #b43a48; }
.rank-unsupported { padding: 18px; border: 1px solid #efb6bc; color: #9d2f3c; background: #fff2f3; }
.rank-dialog-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; background: rgba(14, 25, 34, .55); }
.rank-dialog { display: grid; gap: 13px; width: min(420px, calc(100vw - 32px)); padding: 20px; border-radius: 7px; background: #f5f8fa; box-shadow: 0 22px 60px rgba(0, 0, 0, .3); }
.rank-dialog h2 { margin: 0; color: #304556; }
.rank-dialog footer { justify-content: flex-end; margin-top: 6px; }
@media (max-width: 900px) { .rank-workspace { grid-template-columns: minmax(210px, 250px) minmax(0, 1fr); } .form-grid { grid-template-columns: 1fr; } }
</style>
