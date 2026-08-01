<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { SUPPORTED_LOCALES } from "../i18n/index.js";
import { createApplicationSettingsPatch } from "../lib/applicationSettingsPatch.js";

const { t, locale } = useI18n({ useScope: "global" });
const api = window.appSettings;
const defaultIdlePrompt = () => t("applicationSettings.defaultIdlePrompt");
const defaultPromptTexts = () => Object.fromEntries(
  SUPPORTED_LOCALES.map((item) => [item, item === locale.value ? defaultIdlePrompt() : ""]),
);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const savedMessage = ref("");
const saved = ref({
  entryMethod: "touch",
  mode: "debug",
  touchIdlePromptTexts: defaultPromptTexts(),
  touchIdlePromptFontSize: 72,
});
const draft = reactive({
  entryMethod: "touch",
  mode: "debug",
  touchIdlePromptTexts: defaultPromptTexts(),
  touchIdlePromptFontSize: 72,
});
let removeSettingsListener = null;

const currentIdlePromptText = computed({
  get: () => draft.touchIdlePromptTexts[locale.value] || defaultIdlePrompt(),
  set: (value) => {
    draft.touchIdlePromptTexts = {
      ...draft.touchIdlePromptTexts,
      [locale.value]: value,
    };
  },
});

const dirty = computed(
  () => draft.entryMethod !== saved.value.entryMethod
    || draft.mode !== saved.value.mode
    || JSON.stringify(draft.touchIdlePromptTexts) !== JSON.stringify(saved.value.touchIdlePromptTexts)
    || draft.touchIdlePromptFontSize !== saved.value.touchIdlePromptFontSize,
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
  const source = settings?.touchIdlePromptTexts && typeof settings.touchIdlePromptTexts === "object"
    ? settings.touchIdlePromptTexts
    : typeof settings?.touchIdlePromptText === "string"
      ? { [locale.value]: settings.touchIdlePromptText }
      : {};
  const promptTexts = Object.fromEntries(
    SUPPORTED_LOCALES.map((item) => [
      item,
      typeof source[item] === "string" && source[item].trim()
        ? source[item].trim()
        : item === locale.value ? defaultIdlePrompt() : "",
    ]),
  );
  const promptFontSize = Number(settings?.touchIdlePromptFontSize);
  const normalized = {
    entryMethod: ["touch", "coin", "wristband"].includes(settings?.entryMethod)
      ? settings.entryMethod
      : "touch",
    mode: settings?.mode === "game" ? "game" : "debug",
    touchIdlePromptTexts: promptTexts,
    touchIdlePromptFontSize: Number.isInteger(promptFontSize) && promptFontSize >= 32 && promptFontSize <= 200
      ? promptFontSize
      : 72,
  };
  saved.value = normalized;
  draft.entryMethod = normalized.entryMethod;
  draft.mode = normalized.mode;
  draft.touchIdlePromptTexts = normalized.touchIdlePromptTexts;
  draft.touchIdlePromptFontSize = normalized.touchIdlePromptFontSize;
}

async function saveSettings() {
  if (!api?.update || saving.value || !dirty.value) return;
  saving.value = true;
  errorMessage.value = "";
  savedMessage.value = "";
  try {
    applySettings(
      await api.update(createApplicationSettingsPatch(draft)),
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
          <span>{{ t("applicationSettings.idlePromptText") }}</span>
          <input
            v-model="currentIdlePromptText"
            type="text"
            maxlength="48"
            autocomplete="off"
          />
          <small>{{ t("applicationSettings.idlePromptTextHint") }}</small>
        </label>

        <label class="application-settings-field">
          <span>{{ t("applicationSettings.idlePromptFontSize") }}</span>
          <span class="application-settings-input-row">
            <input
              v-model.number="draft.touchIdlePromptFontSize"
              type="number"
              min="32"
              max="200"
              step="1"
              inputmode="numeric"
            />
            <span class="application-settings-range-hint">
              {{ t("applicationSettings.idlePromptFontSizeRange") }}
            </span>
          </span>
          <small>{{ t("applicationSettings.idlePromptFontSizeHint") }}</small>
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

.application-settings-field input {
  min-height: 46px;
  padding: 0 13px;
  border: 1px solid #b9c4d1;
  border-radius: 6px;
  color: #344151;
  background: #fff;
  font: inherit;
}

.application-settings-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.application-settings-input-row input {
  flex: 1;
  min-width: 0;
}

.application-settings-range-hint {
  flex: none;
  padding: 5px 9px;
  border: 1px solid #c8d4e2;
  border-radius: 5px;
  color: #536579;
  background: #eef3f8;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
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
