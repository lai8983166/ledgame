<script setup>
import { onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  DEFAULT_CONFIG_DRAFT,
  RGB_MODES,
  CONTROLLER_MODELS,
  normalizeNetworkInterfaceList,
  networkInterfaceLabel,
  classifyBackendErrorCode,
  extractBackendError,
} from "../../lib/elc408/elc408ToolsState.js";

const { t } = useI18n({ useScope: "global" });
const api = window.elc408Tools;
const draft = reactive({ ...DEFAULT_CONFIG_DRAFT });
const networkInterfaces = ref([]);
const loadingInterfaces = ref(false);
const interfacesError = ref("");
const downloading = ref(false);
const reloading = ref(false);
const successMessage = ref("");
const fieldErrors = ref({});
const errorMessage = ref("");

onMounted(() => {
  loadInterfaces();
});

async function loadInterfaces() {
  loadingInterfaces.value = true;
  interfacesError.value = "";
  try {
    const payload = await api.networkInterfaces();
    networkInterfaces.value = normalizeNetworkInterfaceList(payload);
  } catch (error) {
    const extracted = extractBackendError(error);
    interfacesError.value = extracted.message;
  } finally {
    loadingInterfaces.value = false;
  }
}

async function download() {
  if (!draft.networkInterfaceId) {
    fieldErrors.value = { networkInterfaceId: t("elc408.configuration.validationFailed") };
    return;
  }
  downloading.value = true;
  successMessage.value = "";
  errorMessage.value = "";
  fieldErrors.value = {};
  try {
    const generated = await api.generateConfig({ ...draft });
    if (generated?.code && generated.code !== 200) {
      errorMessage.value = generated.message || t("elc408.configuration.validationFailed");
      fieldErrors.value = mapFieldErrors(generated.message);
      return;
    }
    const data = generated?.data || generated;
    const content = data?.content;
    if (!content) {
      errorMessage.value = t("elc408.configuration.validationFailed");
      return;
    }
    const saved = await api.saveGeneratedFile({
      kind: "config",
      suggestedFileName: data?.fileName || "conf.json",
      content,
    });
    if (saved?.canceled) {
      successMessage.value = t("elc408.configuration.downloadCanceled");
      return;
    }
    successMessage.value = t("elc408.configuration.downloadSuccess", { fileName: saved.fileName });
  } catch (error) {
    const extracted = extractBackendError(error);
    const kind = classifyBackendErrorCode(extracted.code);
    errorMessage.value = t(`elc408.errors.${kind}`, { message: extracted.message });
  } finally {
    downloading.value = false;
  }
}

async function reloadRuntime() {
  reloading.value = true;
  successMessage.value = "";
  errorMessage.value = "";
  try {
    const response = await api.reload();
    if (response?.code && response.code !== 200) {
      errorMessage.value = response.message || t("elc408.configuration.reloadFailed");
      return;
    }
    successMessage.value = t("elc408.configuration.reloadSuccess");
  } catch (error) {
    const extracted = extractBackendError(error);
    const kind = classifyBackendErrorCode(extracted.code);
    errorMessage.value = t(`elc408.errors.${kind}`, { message: extracted.message });
  } finally {
    reloading.value = false;
  }
}

function mapFieldErrors(message) {
  if (typeof message !== "string") {
    return {};
  }
  const map = {};
  for (const field of ["tcpServerPort", "debounceMillis", "controllerModel", "rgbMode", "networkInterface"]) {
    if (message.includes(field)) {
      map[field] = message;
    }
  }
  return map;
}
</script>

<template>
  <div class="elc408-panel">
    <div class="elc408-form">
      <label class="elc408-field">
        <span>{{ t("elc408.configuration.tcpServerPort") }}</span>
        <input
          v-model.number="draft.tcpServerPort"
          type="number"
          min="1"
          max="65535"
        />
        <small v-if="fieldErrors.tcpServerPort" class="elc408-error">{{ fieldErrors.tcpServerPort }}</small>
      </label>
      <label class="elc408-field elc408-checkbox">
        <input
          v-model="draft.allowRepeatActiveOnDown"
          type="checkbox"
        />
        <span>{{ t("elc408.configuration.allowRepeatActiveOnDown") }}</span>
      </label>
      <label class="elc408-field">
        <span>{{ t("elc408.configuration.debounceMillis") }}</span>
        <input
          v-model.number="draft.debounceMillis"
          type="number"
          min="0"
          max="60000"
        />
        <small v-if="fieldErrors.debounceMillis" class="elc408-error">{{ fieldErrors.debounceMillis }}</small>
      </label>
      <label class="elc408-field">
        <span>{{ t("elc408.configuration.networkInterface") }}</span>
        <select v-model="draft.networkInterfaceId" :disabled="loadingInterfaces">
          <option value="">{{ t("elc408.configuration.networkInterfacePlaceholder") }}</option>
          <option v-for="entry in networkInterfaces" :key="entry.id" :value="entry.id">
            {{ networkInterfaceLabel(entry) }}
          </option>
        </select>
        <small
          class="elc408-field-hint"
          :class="{ 'elc408-error': interfacesError || fieldErrors.networkInterface }"
          aria-live="polite"
        >
          {{
            loadingInterfaces
              ? t("elc408.configuration.networkInterfaceLoading")
              : interfacesError || fieldErrors.networkInterface ||
                (networkInterfaces.length === 0 ? t("elc408.configuration.networkInterfaceEmpty") : "\u00a0")
          }}
        </small>
      </label>
      <label class="elc408-field">
        <span>{{ t("elc408.configuration.controllerModel") }}</span>
        <select v-model="draft.controllerModel">
          <option v-for="model in CONTROLLER_MODELS" :key="model" :value="model">{{ model }}</option>
        </select>
      </label>
      <label class="elc408-field">
        <span>{{ t("elc408.configuration.rgbMode") }}</span>
        <select v-model="draft.rgbMode">
          <option v-for="mode in RGB_MODES" :key="mode" :value="mode">{{ mode }}</option>
        </select>
      </label>
      <div class="elc408-actions">
        <button
          type="button"
          class="primary"
          :disabled="downloading || !draft.networkInterfaceId"
          @click="download"
        >
          {{ downloading ? t("elc408.configuration.downloading") : t("elc408.configuration.download") }}
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="downloading || reloading"
          @click="reloadRuntime"
        >
          {{ reloading ? t("elc408.configuration.reloading") : t("elc408.configuration.reload") }}
        </button>
      </div>
      <p v-if="successMessage" class="elc408-success">{{ successMessage }}</p>
      <p v-if="errorMessage" class="elc408-error">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<style scoped>
.elc408-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: auto;
}
.elc408-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(240px, 1fr));
  gap: 20px 18px;
  width: min(820px, 100%);
  padding: 6px;
}
.elc408-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  color: #3d4857;
  font-size: 0.84rem;
  font-weight: 620;
}
.elc408-field > span {
  color: #596575;
}
.elc408-field input,
.elc408-field select {
  width: 100%;
  min-height: 40px;
  padding: 0 11px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  outline: none;
  color: #344050;
  background: #fff;
  font-weight: 500;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.elc408-field input:focus,
.elc408-field select:focus {
  border-color: #6e96c4;
  box-shadow: 0 0 0 3px rgba(79, 126, 182, 0.14);
}
.elc408-field small {
  color: #7a8694;
  font-weight: 500;
}
.elc408-field-hint {
  display: block;
  min-height: 1.2em;
  line-height: 1.2;
}
.elc408-checkbox {
  align-self: end;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #d7dee7;
  border-radius: 6px;
  background: #f1f5f9;
  cursor: pointer;
}
.elc408-checkbox input {
  width: 16px;
  min-height: 16px;
  margin: 0;
  accent-color: #4f7eb6;
}
.elc408-checkbox > span {
  color: #455161;
}
.elc408-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-start;
  padding-top: 2px;
}
.elc408-actions button {
  min-height: 40px;
  padding: 0 18px;
  border: 1px solid #c2ccd8;
  border-radius: 6px;
  color: #4b5868;
  background: #fff;
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 680;
  box-shadow: 0 3px 8px rgba(79, 126, 182, 0.2);
}
.elc408-actions button.primary {
  border-color: #3f6fa8;
  color: #fff;
  background: #4f7eb6;
}
.elc408-actions button.secondary:hover:not(:disabled) {
  border-color: #8eacd0;
  color: #315d91;
  background: #e7eef7;
}
.elc408-actions button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
  box-shadow: none;
}
.elc408-success {
  grid-column: 1 / -1;
  margin: 0;
  color: #34805f;
  font-size: 0.85rem;
}
.elc408-error {
  grid-column: 1 / -1;
  margin: 0;
  color: #b35f68;
  font-size: 0.85rem;
}
@media (max-width: 680px) {
  .elc408-form {
    grid-template-columns: 1fr;
  }
}
</style>
