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
const connectionTestStatus = ref("");
const saved = ref({
  entryMethod: "touch",
  mode: "debug",
  memberPlatformHost: "127.0.0.1",
  memberPlatformPort: 8090,
  touchIdlePromptTexts: defaultPromptTexts(),
  touchIdlePromptFontSize: 72,
  applicationTitle: "LED Game",
  applicationIconPath: "",
  secondaryDisplayBackgroundPath: "",
  touchExitPassword: "",
});
const draft = reactive({
  entryMethod: "touch",
  mode: "debug",
  memberPlatformHost: "127.0.0.1",
  memberPlatformPort: 8090,
  touchIdlePromptTexts: defaultPromptTexts(),
  touchIdlePromptFontSize: 72,
  applicationTitle: "LED Game",
  applicationIconPath: "",
  secondaryDisplayBackgroundPath: "",
  touchExitPassword: "",
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
    || draft.memberPlatformHost !== saved.value.memberPlatformHost
    || Number(draft.memberPlatformPort) !== Number(saved.value.memberPlatformPort)
    || JSON.stringify(draft.touchIdlePromptTexts) !== JSON.stringify(saved.value.touchIdlePromptTexts)
    || draft.touchIdlePromptFontSize !== saved.value.touchIdlePromptFontSize
    || draft.applicationTitle !== saved.value.applicationTitle
    || draft.secondaryDisplayBackgroundPath !== saved.value.secondaryDisplayBackgroundPath
    || Boolean(draft.touchExitPassword),
);
const applicationIconLabel = computed(() => draft.applicationIconPath || t("management.defaultIcon"));
const secondaryBackgroundLabel = computed(() => {
  if (!draft.secondaryDisplayBackgroundPath) return t("management.defaultBackground");
  return String(draft.secondaryDisplayBackgroundPath).split(/[\\/]/).pop();
});

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
    memberPlatformHost: typeof settings?.memberPlatformHost === "string" && settings.memberPlatformHost.trim()
      ? settings.memberPlatformHost.trim()
      : "127.0.0.1",
    memberPlatformPort: Number.isInteger(Number(settings?.memberPlatformPort))
      && Number(settings.memberPlatformPort) >= 1 && Number(settings.memberPlatformPort) <= 65535
      ? Number(settings.memberPlatformPort)
      : 8090,
    touchIdlePromptTexts: promptTexts,
    touchIdlePromptFontSize: Number.isInteger(promptFontSize) && promptFontSize >= 32 && promptFontSize <= 200
      ? promptFontSize
      : 72,
    applicationTitle: typeof settings?.applicationTitle === "string" && settings.applicationTitle.trim()
      ? settings.applicationTitle.trim() : "LED Game",
    applicationIconPath: typeof settings?.applicationIconPath === "string" ? settings.applicationIconPath : "",
    secondaryDisplayBackgroundPath: typeof settings?.secondaryDisplayBackgroundPath === "string"
      ? settings.secondaryDisplayBackgroundPath : "",
    touchExitPassword: "",
  };
  saved.value = normalized;
  draft.entryMethod = normalized.entryMethod;
  draft.mode = normalized.mode;
  draft.memberPlatformHost = normalized.memberPlatformHost;
  draft.memberPlatformPort = normalized.memberPlatformPort;
  draft.touchIdlePromptTexts = normalized.touchIdlePromptTexts;
  draft.touchIdlePromptFontSize = normalized.touchIdlePromptFontSize;
  draft.applicationTitle = normalized.applicationTitle;
  draft.applicationIconPath = normalized.applicationIconPath;
  draft.secondaryDisplayBackgroundPath = normalized.secondaryDisplayBackgroundPath;
  draft.touchExitPassword = "";
}

async function chooseApplicationIcon() {
  if (!api?.chooseIcon) return;
  errorMessage.value = "";
  try {
    const result = await api.chooseIcon();
    if (!result?.canceled && result?.settings) applySettings(result.settings);
  } catch (error) { errorMessage.value = error?.message || t("common.operationFailed"); }
}

async function chooseSecondaryBackground() {
  if (!api?.chooseSecondaryBackground) return;
  errorMessage.value = "";
  try {
    const result = await api.chooseSecondaryBackground();
    if (!result?.canceled && result?.settings) applySettings(result.settings);
  } catch (error) {
    errorMessage.value = error?.message || t("management.backgroundChooseFailed");
  }
}

async function clearSecondaryBackground() {
  if (!api?.clearSecondaryBackground || !draft.secondaryDisplayBackgroundPath) return;
  errorMessage.value = "";
  try {
    applySettings(await api.clearSecondaryBackground());
  } catch (error) {
    errorMessage.value = error?.message || t("management.backgroundClearFailed");
  }
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

async function testMemberPlatform() {
  if (!api?.testMemberPlatform) {
    connectionTestStatus.value = "unavailable";
    return;
  }
  if (!draft.memberPlatformHost.trim() || !Number.isInteger(Number(draft.memberPlatformPort))
    || Number(draft.memberPlatformPort) < 1 || Number(draft.memberPlatformPort) > 65535) {
    connectionTestStatus.value = "invalid";
    return;
  }
  connectionTestStatus.value = "testing";
  try {
    const result = await api.testMemberPlatform({
      memberPlatformHost: draft.memberPlatformHost,
      memberPlatformPort: Number(draft.memberPlatformPort),
    });
    connectionTestStatus.value = result?.reachable ? "success" : "failed";
  } catch (_error) {
    connectionTestStatus.value = "failed";
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
        <fieldset class="application-settings-connection">
          <legend>{{ t('management.appearanceSecurity') }}</legend>
          <label class="application-settings-field"><span>{{ t('management.appTitle') }}</span><input v-model.trim="draft.applicationTitle" type="text" maxlength="64" /></label>
          <label class="application-settings-field"><span>{{ t('management.exitPassword') }}</span><input v-model="draft.touchExitPassword" v-bind="{ placeholder: t('management.passwordPlaceholder') }" type="password" inputmode="numeric" maxlength="12" /><small>{{ t('management.passwordHint') }}</small></label>
          <div class="application-settings-actions"><button class="application-settings-secondary" type="button" @click="chooseApplicationIcon">{{ t('management.chooseIcon') }}</button><span>{{ applicationIconLabel }}</span></div>
          <div class="application-settings-actions application-settings-background-actions">
            <button class="application-settings-secondary" type="button" @click="chooseSecondaryBackground">{{ t('management.chooseSecondaryBackground') }}</button>
            <span>{{ secondaryBackgroundLabel }}</span>
            <button v-if="draft.secondaryDisplayBackgroundPath" class="application-settings-secondary" type="button" @click="clearSecondaryBackground">{{ t('management.clearSecondaryBackground') }}</button>
          </div>
          <small>{{ t('management.secondaryBackgroundHint') }}</small>
        </fieldset>
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

        <fieldset class="application-settings-connection">
          <legend>{{ t("applicationSettings.memberPlatform.title") }}</legend>
          <p>{{ t("applicationSettings.memberPlatform.description") }}</p>
          <label class="application-settings-field">
            <span>{{ t("applicationSettings.memberPlatform.host") }}</span>
            <input v-model.trim="draft.memberPlatformHost" type="text" autocomplete="off" />
          </label>
          <label class="application-settings-field">
            <span>{{ t("applicationSettings.memberPlatform.port") }}</span>
            <input v-model.number="draft.memberPlatformPort" type="number" min="1" max="65535" step="1" inputmode="numeric" />
          </label>
          <div class="application-settings-actions">
            <button class="application-settings-secondary" type="button" :disabled="connectionTestStatus === 'testing'" @click="testMemberPlatform">
              {{ connectionTestStatus === 'testing' ? t("applicationSettings.memberPlatform.testing") : t("applicationSettings.memberPlatform.test") }}
            </button>
            <span v-if="connectionTestStatus === 'success'" class="application-settings-success">{{ t("applicationSettings.memberPlatform.testSuccess") }}</span>
            <span v-else-if="connectionTestStatus === 'failed'" class="application-settings-error">{{ t("applicationSettings.memberPlatform.testFailed") }}</span>
            <span v-else-if="connectionTestStatus === 'invalid'" class="application-settings-error">{{ t("applicationSettings.memberPlatform.invalid") }}</span>
          </div>
        </fieldset>

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

.application-settings-connection {
  display: grid;
  gap: 14px;
  max-width: 620px;
  padding: 18px;
  border: 1px solid #cfd7e1;
  border-radius: 6px;
}

.application-settings-connection legend {
  padding: 0 6px;
  color: #354252;
  font-weight: 720;
}

.application-settings-connection > p {
  margin: 0;
  color: #687483;
}

.application-settings-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.application-settings-background-actions {
  flex-wrap: wrap;
}

.application-settings-background-actions > span {
  min-width: 0;
  overflow: hidden;
  color: #687483;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.application-settings-secondary {
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid #9eafc1;
  border-radius: 6px;
  color: #365f8c;
  background: #fff;
  cursor: pointer;
  font-weight: 700;
}

.application-settings-secondary:disabled {
  color: #929ba6;
  cursor: wait;
}

.application-settings-success {
  color: #2f7552;
  font-weight: 650;
}

.application-settings-error {
  color: #ad3d45 !important;
}
</style>
