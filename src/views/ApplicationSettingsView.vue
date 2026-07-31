<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const api = window.appSettings;
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const savedMessage = ref("");
const saved = ref({
  entryMethod: "touch",
  mode: "debug",
});
const draft = reactive({
  entryMethod: "touch",
  mode: "debug",
});
let removeSettingsListener = null;

const dirty = computed(
  () => draft.entryMethod !== saved.value.entryMethod || draft.mode !== saved.value.mode,
);

onMounted(async () => {
  removeSettingsListener = api?.onChanged?.((settings) => applySettings(settings)) || null;
  if (!api?.get) {
    loading.value = false;
    errorMessage.value = t("applicationSettings.apiUnavailable");
    return;
  }
  try {
    applySettings(await api.get());
  } catch (error) {
    errorMessage.value = error?.message || t("applicationSettings.loadFailed");
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  removeSettingsListener?.();
});

function applySettings(settings) {
  const normalized = {
    entryMethod: ["touch", "coin", "wristband"].includes(settings?.entryMethod)
      ? settings.entryMethod
      : "touch",
    mode: settings?.mode === "game" ? "game" : "debug",
  };
  saved.value = normalized;
  draft.entryMethod = normalized.entryMethod;
  draft.mode = normalized.mode;
}

async function saveSettings() {
  if (!api?.update || saving.value || !dirty.value) return;
  saving.value = true;
  errorMessage.value = "";
  savedMessage.value = "";
  try {
    applySettings(
      await api.update({
        entryMethod: draft.entryMethod,
        mode: draft.mode,
      }),
    );
    savedMessage.value = t("applicationSettings.saved");
  } catch (error) {
    errorMessage.value = error?.message || t("applicationSettings.saveFailed");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="workspace application-settings-view">
    <header class="page-heading">
      <div>
        <span>{{ t("applicationSettings.subtitle") }}</span>
        <h1>{{ t("applicationSettings.title") }}</h1>
      </div>
    </header>

    <div class="application-settings-panel" :aria-busy="loading || saving">
      <p>{{ t("applicationSettings.description") }}</p>

      <div v-if="loading" class="application-settings-status">
        {{ t("common.loading") }}
      </div>

      <template v-else>
        <label class="application-settings-field">
          <span>{{ t("applicationSettings.entryMethod") }}</span>
          <select v-model="draft.entryMethod">
            <option value="touch">{{ t("applicationSettings.entryMethods.touch") }}</option>
            <option value="coin">{{ t("applicationSettings.entryMethods.coin") }}</option>
            <option value="wristband">{{ t("applicationSettings.entryMethods.wristband") }}</option>
          </select>
          <small>{{ t("applicationSettings.entryMethodHint") }}</small>
        </label>

        <label class="application-settings-field">
          <span>{{ t("applicationSettings.mode") }}</span>
          <select v-model="draft.mode">
            <option value="debug">{{ t("applicationSettings.modes.debug") }}</option>
            <option value="game">{{ t("applicationSettings.modes.game") }}</option>
          </select>
          <small>{{ t(`applicationSettings.modeHints.${draft.mode}`) }}</small>
        </label>

        <div class="application-settings-actions">
          <button
            class="application-settings-save"
            type="button"
            :disabled="saving || !dirty"
            @click="saveSettings"
          >
            {{ saving ? t("applicationSettings.saving") : t("common.save") }}
          </button>
          <span v-if="savedMessage" class="application-settings-success" role="status">
            {{ savedMessage }}
          </span>
        </div>
      </template>

      <p v-if="errorMessage" class="application-settings-error" role="alert">
        {{ errorMessage }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.application-settings-view {
  max-width: 900px;
}

.application-settings-panel {
  display: grid;
  gap: 22px;
  padding: 30px;
  border: 1px solid #cfd7e1;
  border-radius: 8px;
  background: #f8fafc;
  box-shadow: 0 16px 34px rgba(72, 86, 104, 0.12);
}

.application-settings-panel > p {
  margin: 0;
  color: #687483;
}

.application-settings-field {
  display: grid;
  gap: 8px;
  max-width: 620px;
}

.application-settings-field > span {
  color: #354252;
  font-weight: 720;
}

.application-settings-field select {
  min-height: 46px;
  padding: 0 13px;
  border: 1px solid #b9c4d1;
  border-radius: 6px;
  color: #344151;
  background: #fff;
  font: inherit;
}

.application-settings-field small {
  color: #7b8694;
}

.application-settings-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.application-settings-save {
  min-width: 120px;
  min-height: 44px;
  border: 0;
  border-radius: 6px;
  color: #fff;
  background: #365f8c;
  cursor: pointer;
  font-weight: 700;
}

.application-settings-save:disabled {
  color: #929ba6;
  background: #dce2e8;
  cursor: not-allowed;
}

.application-settings-success {
  color: #2f7552;
  font-weight: 650;
}

.application-settings-error {
  color: #ad3d45 !important;
}
</style>
