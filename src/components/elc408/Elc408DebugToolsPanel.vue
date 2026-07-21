<script setup>
import { onMounted, onUnmounted, reactive, ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  DEFAULT_DEBUG_DRAFT,
  RGB_MODES,
  CONTROLLER_MODELS,
  DISPLAY_COLORS,
  displayColorToRgb,
  normalizeNetworkInterfaceList,
  networkInterfaceLabel,
  normalizeControllerList,
  normalizeLogList,
  normalizeLogEntry,
  classifyBackendErrorCode,
  extractBackendError,
} from "../../lib/elc408/elc408ToolsState.js";

const { t } = useI18n({ useScope: "global" });
const api = window.elc408Tools;
const props = defineProps({
  active: {
    type: Boolean,
    default: false,
  },
});

const draft = reactive({ ...DEFAULT_DEBUG_DRAFT });
const networkInterfaces = ref([]);
const interfacesError = ref("");
const loadingInterfaces = ref(false);

const controllers = ref([]);
const state = ref(null);
const logs = ref([]);
const logsCursor = ref(0);
const logsCapacity = 2048;
const expandedLogSeqs = ref(new Set());

const searchBusy = ref(false);
const startBusy = ref(false);
const stopBusy = ref(false);
const clearBusy = ref(false);
const captureStatus = ref("inactive");
const errorMessage = ref("");
const successMessage = ref("");

let pollTimer = null;
let pollInFlight = false;
let lastPollToken = 0;
let captureToken = 0;
let mounted = false;

const isRunning = computed(() => Boolean(state.value?.debugRunning));
const captureStatusLabel = computed(() => t(`elc408.debug.capture.${captureStatus.value}`));
const ownerLabel = computed(() => {
  if (!state.value) {
    return "";
  }
  return state.value.owner === "DEBUG"
    ? t("elc408.debug.ownerDebug")
    : t("elc408.debug.ownerUpstream");
});

onMounted(async () => {
  mounted = true;
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  await Promise.all([loadInterfaces(), refreshState()]);
  await reconcileLogCapture();
});

onUnmounted(() => {
  mounted = false;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }
  stopPolling();
  captureToken += 1;
  void setLogCapture(false);
});

watch(() => props.active, () => {
  if (mounted) {
    void reconcileLogCapture();
  }
});

function startPolling() {
  stopPolling();
  void pollLogs();
  pollTimer = setInterval(pollLogs, 250);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  lastPollToken += 1; // invalidate in-flight responses
  pollInFlight = false;
}

function onVisibilityChange() {
  void reconcileLogCapture();
}

function shouldCaptureLogs() {
  return mounted
    && props.active
    && (typeof document === "undefined" || document.visibilityState === "visible");
}

async function setLogCapture(enabled) {
  if (typeof api?.setLogCapture !== "function") {
    return false;
  }
  const response = await api.setLogCapture(enabled);
  const data = response?.data ?? response;
  return data?.enabled === enabled;
}

async function reconcileLogCapture() {
  const token = ++captureToken;
  stopPolling();

  if (!shouldCaptureLogs()) {
    captureStatus.value = "inactive";
    try {
      await setLogCapture(false);
    } catch (_error) {
      if (token === captureToken && mounted && props.active) {
        captureStatus.value = "failed";
      }
    }
    return;
  }

  captureStatus.value = "starting";
  try {
    const enabled = await setLogCapture(true);
    if (token !== captureToken || !shouldCaptureLogs()) {
      if (!shouldCaptureLogs()) {
        void setLogCapture(false);
      }
      return;
    }
    if (!enabled) {
      throw new Error("Backend did not confirm protocol log capture");
    }
    captureStatus.value = "active";
    startPolling();
  } catch (_error) {
    if (token === captureToken) {
      captureStatus.value = "failed";
    }
  }
}

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

async function refreshState() {
  try {
    const payload = await api.debugState();
    state.value = payload?.data || payload;
    controllers.value = normalizeControllerList(state.value);
  } catch (error) {
    applyBackendError(error);
  }
}

async function pollLogs() {
  if (captureStatus.value !== "active" || !shouldCaptureLogs() || pollInFlight) {
    return;
  }
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }
  pollInFlight = true;
  const token = lastPollToken + 1;
  lastPollToken = token;
  try {
    const payload = await api.logs(logsCursor.value, 256);
    if (token !== lastPollToken) {
      return;
    }
    const result = normalizeLogList(payload, logsCursor.value);
    if (result.entries.length > 0) {
      const merged = [...logs.value, ...result.entries];
      if (merged.length > logsCapacity) {
        merged.splice(0, merged.length - logsCapacity);
      }
      logs.value = merged;
    }
    logsCursor.value = result.nextCursor;
  } catch (_error) {
    // Best-effort polling; transient errors do not surface in the UI.
  } finally {
    if (token === lastPollToken) {
      pollInFlight = false;
    }
  }
}

async function clearLogs() {
  clearBusy.value = true;
  try {
    const result = await api.clearLogs();
    logs.value = [];
    expandedLogSeqs.value = new Set();
    const next = result?.data ?? result;
    logsCursor.value = Number.isFinite(next) ? next : 0;
  } catch (error) {
    applyBackendError(error);
  } finally {
    clearBusy.value = false;
  }
}

async function search() {
  searchBusy.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const payload = {
      networkInterfaceId: draft.networkInterfaceId,
      controllerModel: draft.controllerModel,
    };
    const response = await api.search(payload);
    if (response?.code && response.code !== 200) {
      applyBackendCode(response.code, response.message);
      return;
    }
    await refreshState();
  } catch (error) {
    applyBackendError(error);
  } finally {
    searchBusy.value = false;
  }
}

async function start() {
  startBusy.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const payload = {
      rgbMode: draft.rgbMode,
      networkInterfaceId: draft.networkInterfaceId,
      controllerModel: draft.controllerModel,
      controllerCount: draft.controllerCount,
      maxPointsPerChannel: draft.maxPointsPerChannel,
      displayColor: displayColorToRgb(draft.displayColor),
      frameIntervalMs: draft.frameIntervalMs,
    };
    const response = await api.start(payload);
    if (response?.code && response.code !== 200) {
      applyBackendCode(response.code, response.message);
      return;
    }
    await refreshState();
    successMessage.value = t("elc408.debug.running");
  } catch (error) {
    applyBackendError(error);
  } finally {
    startBusy.value = false;
  }
}

async function stop() {
  stopBusy.value = true;
  errorMessage.value = "";
  try {
    const response = await api.stop();
    if (response?.code && response.code !== 200) {
      applyBackendCode(response.code, response.message);
      return;
    }
    await refreshState();
    successMessage.value = t("elc408.debug.stopping");
  } catch (error) {
    applyBackendError(error);
  } finally {
    stopBusy.value = false;
  }
}

function applyBackendCode(code, message) {
  const extracted = extractCode(message);
  const kind = classifyBackendErrorCode(extracted);
  errorMessage.value = t(`elc408.errors.${kind}`, { message: message || "" });
}

function applyBackendError(error) {
  const extracted = extractBackendError(error);
  const kind = classifyBackendErrorCode(extracted.code);
  errorMessage.value = t(`elc408.errors.${kind}`, { message: extracted.message });
}

function extractCode(message) {
  if (typeof message !== "string") {
    return "";
  }
  const match = message.match(/^([A-Z][A-Z0-9_]+):/);
  return match ? match[1] : "";
}

function formatTime(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp === 0) {
    return "";
  }
  return new Date(timestamp).toLocaleTimeString();
}

function isLogExpanded(seq) {
  return expandedLogSeqs.value.has(seq);
}

function toggleLog(seq) {
  const next = new Set(expandedLogSeqs.value);
  if (next.has(seq)) {
    next.delete(seq);
  } else {
    next.add(seq);
  }
  expandedLogSeqs.value = next;
}

function logHexPreview(entry) {
  const hex = String(entry.hex ?? "");
  const previewLength = 96;
  return hex.length > previewLength ? `${hex.slice(0, previewLength)} ...` : hex;
}
</script>

<template>
  <div class="elc408-debug-panel">
    <aside class="elc408-debug-controls">
      <fieldset>
        <legend>{{ t("elc408.debug.networkInterface") }}</legend>
        <select v-model="draft.networkInterfaceId" :disabled="loadingInterfaces">
          <option value="">{{ t("elc408.configuration.networkInterfacePlaceholder") }}</option>
          <option v-for="entry in networkInterfaces" :key="entry.id" :value="entry.id">
            {{ networkInterfaceLabel(entry) }}
          </option>
        </select>
        <small v-if="loadingInterfaces">{{ t("elc408.configuration.networkInterfaceLoading") }}</small>
        <small v-else-if="interfacesError" class="elc408-error">{{ interfacesError }}</small>
      </fieldset>
      <fieldset>
        <legend>{{ t("elc408.debug.controllerModel") }}</legend>
        <select v-model="draft.controllerModel">
          <option v-for="model in CONTROLLER_MODELS" :key="model" :value="model">{{ model }}</option>
        </select>
      </fieldset>
      <fieldset>
        <legend>{{ t("elc408.debug.rgbMode") }}</legend>
        <select v-model="draft.rgbMode">
          <option v-for="mode in RGB_MODES" :key="mode" :value="mode">{{ mode }}</option>
        </select>
      </fieldset>
      <div class="elc408-debug-actions">
        <button
          type="button"
          :disabled="searchBusy || !draft.networkInterfaceId"
          @click="search"
        >
          {{ searchBusy ? t("elc408.debug.searching") : t("elc408.debug.search") }}
        </button>
      </div>
      <fieldset>
        <legend>{{ t("elc408.debug.controllers") }}</legend>
        <ul v-if="controllers.length > 0" class="elc408-controller-list">
          <li v-for="(controller, idx) in controllers" :key="controller.mac || idx">
            <span class="elc408-mac">{{ controller.mac || "—" }}</span>
            <span class="elc408-source">{{ controller.sourceIp }}</span>
          </li>
        </ul>
        <p v-else class="elc408-empty">{{ t("elc408.wiring.empty") }}</p>
      </fieldset>
      <fieldset>
        <legend>{{ t("elc408.debug.controllerCount") }}</legend>
        <input v-model.number="draft.controllerCount" type="number" min="1" max="32" />
      </fieldset>
      <fieldset>
        <legend>{{ t("elc408.debug.maxPointsPerChannel") }}</legend>
        <input v-model.number="draft.maxPointsPerChannel" type="number" min="1" max="170" />
      </fieldset>
      <fieldset>
        <legend>{{ t("elc408.debug.displayColor") }}</legend>
        <select v-model="draft.displayColor">
          <option v-for="color in DISPLAY_COLORS" :key="color" :value="color">
            {{ t(`elc408.debug.colors.${color}`) }}
          </option>
        </select>
      </fieldset>
      <fieldset>
        <legend>{{ t("elc408.debug.frameIntervalMs") }}</legend>
        <input v-model.number="draft.frameIntervalMs" type="number" min="1" max="60000" />
      </fieldset>
      <div class="elc408-debug-actions">
        <button
          type="button"
          class="primary"
          :disabled="startBusy || isRunning || !draft.networkInterfaceId"
          @click="start"
        >
          {{ startBusy ? t("elc408.debug.starting") : t("elc408.debug.start") }}
        </button>
        <button
          type="button"
          :disabled="stopBusy || !isRunning"
          @click="stop"
        >
          {{ stopBusy ? t("elc408.debug.stopping") : t("elc408.debug.stop") }}
        </button>
      </div>
      <p v-if="state" class="elc408-runtime-state">
        <strong>{{ ownerLabel }}</strong>
        <span v-if="isRunning"> · {{ t("elc408.debug.running") }}</span>
      </p>
      <p v-if="successMessage" class="elc408-success">{{ successMessage }}</p>
      <p v-if="errorMessage" class="elc408-error">{{ errorMessage }}</p>
    </aside>
    <section class="elc408-debug-log">
      <header>
        <div class="elc408-log-heading">
          <h2>{{ t("elc408.debug.logs") }}</h2>
          <span :class="['elc408-capture-state', captureStatus]">
            {{ captureStatusLabel }}
          </span>
        </div>
        <button
          type="button"
          :disabled="clearBusy"
          @click="clearLogs"
        >
          {{ t("elc408.debug.clearLogs") }}
        </button>
      </header>
      <div class="elc408-log-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t("elc408.debug.logColumns.timestamp") }}</th>
              <th>{{ t("elc408.debug.logColumns.direction") }}</th>
              <th>{{ t("elc408.debug.logColumns.type") }}</th>
              <th>{{ t("elc408.debug.logColumns.hex") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="logs.length === 0">
              <td colspan="4" class="elc408-empty">{{ t("elc408.debug.logEmpty") }}</td>
            </tr>
            <tr v-for="entry in logs" :key="entry.seq">
              <td>{{ formatTime(entry.timestamp) }}</td>
              <td :class="entry.direction === 'SEND' ? 'send' : 'receive'">
                {{ t(`elc408.debug.directions.${entry.direction}`) }}
              </td>
              <td>{{ entry.type }}</td>
              <td class="elc408-hex">
                <div class="elc408-hex-row">
                  <span
                    class="elc408-hex-value"
                    :class="{ expanded: isLogExpanded(entry.seq) }"
                  >
                    {{ isLogExpanded(entry.seq) ? entry.hex : logHexPreview(entry) }}
                    <small v-if="entry.truncated" class="elc408-log-truncated">
                      {{ t("elc408.debug.logTruncated") }}
                    </small>
                  </span>
                  <button
                    v-if="entry.hex"
                    type="button"
                    class="elc408-log-expand"
                    :title="isLogExpanded(entry.seq) ? t('elc408.debug.collapseLog') : t('elc408.debug.expandLog')"
                    :aria-label="isLogExpanded(entry.seq) ? t('elc408.debug.collapseLog') : t('elc408.debug.expandLog')"
                    @click="toggleLog(entry.seq)"
                  >
                    {{ isLogExpanded(entry.seq) ? "−" : "..." }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="elc408-send-hint">{{ t("elc408.debug.sendOnlyHint") }}</p>
    </section>
  </div>
</template>

<style scoped>
.elc408-debug-panel {
  display: flex;
  gap: 18px;
  height: 100%;
  min-height: 0;
}
.elc408-debug-controls {
  width: 312px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  padding: 2px 8px 2px 2px;
  scrollbar-gutter: stable;
}
.elc408-debug-controls fieldset {
  margin: 0;
  padding: 8px 10px 10px;
  border: 1px solid #d6dee7;
  border-radius: 6px;
  background: #f5f8fb;
}
.elc408-debug-controls legend {
  padding: 0 5px;
  color: #596575;
  font-size: 0.76rem;
  font-weight: 700;
}
.elc408-debug-controls select,
.elc408-debug-controls input {
  width: 100%;
  min-height: 34px;
  padding: 0 9px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  outline: none;
  color: #344050;
  background: #fff;
  font-size: 0.81rem;
}
.elc408-debug-controls select:focus,
.elc408-debug-controls input:focus {
  border-color: #6e96c4;
  box-shadow: 0 0 0 3px rgba(79, 126, 182, 0.13);
}
.elc408-debug-controls small {
  display: block;
  margin-top: 5px;
  color: #7a8694;
  font-size: 0.75rem;
}
.elc408-debug-actions {
  display: flex;
  gap: 8px;
}
.elc408-debug-actions button {
  flex: 1;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #c2ccd8;
  border-radius: 6px;
  color: #4b5868;
  background: #fff;
  cursor: pointer;
  font-size: 0.81rem;
  font-weight: 680;
}
.elc408-debug-actions button.primary {
  border-color: #3f6fa8;
  color: #fff;
  background: #4f7eb6;
  box-shadow: 0 3px 8px rgba(79, 126, 182, 0.2);
}
.elc408-debug-actions button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
  box-shadow: none;
}
.elc408-controller-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 124px;
  overflow: auto;
}
.elc408-controller-list li {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 4px;
  border-bottom: 1px solid #dde4ec;
  color: #3f4b5a;
  font-size: 0.8rem;
}
.elc408-mac {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-weight: 650;
}
.elc408-source {
  color: #7a8694;
  font-size: 0.72rem;
}
.elc408-empty {
  color: #7a8694;
  font-size: 0.8rem;
  margin: 0;
}
.elc408-runtime-state {
  margin: 2px 0;
  padding: 9px 11px;
  border-left: 3px solid #4f7eb6;
  border-radius: 0 6px 6px 0;
  color: #536071;
  background: #e6edf5;
  font-size: 0.78rem;
}
.elc408-debug-log {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border: 1px solid #d4dce6;
  border-radius: 6px;
  background: #f8fafc;
  overflow: hidden;
}
.elc408-debug-log header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.elc408-debug-log header h2 {
  margin: 0;
  color: #3b4655;
  font-size: 0.95rem;
  font-weight: 700;
}
.elc408-log-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.elc408-capture-state {
  padding: 3px 7px;
  border-radius: 999px;
  color: #687586;
  background: #e7ecf2;
  font-size: 0.7rem;
  font-weight: 700;
}
.elc408-capture-state.active {
  color: #286346;
  background: #dcefe5;
}
.elc408-capture-state.failed {
  color: #9a3f3f;
  background: #f6dfdf;
}
.elc408-log-truncated {
  margin-left: 6px;
  color: #8a6570;
  font-family: inherit;
  font-size: 0.68rem;
}
.elc408-debug-log header button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid #c5cfdb;
  border-radius: 6px;
  color: #596575;
  background: #fff;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 650;
}
.elc408-log-table-wrap {
  flex: 1;
  min-height: 0;
  border: 1px solid #d6dee7;
  border-radius: 6px;
  background: #fff;
  overflow: auto;
}
.elc408-debug-log table {
  width: 100%;
  border-collapse: collapse;
  color: #485465;
  font-size: 0.77rem;
}
.elc408-debug-log th,
.elc408-debug-log td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid #e3e8ee;
  vertical-align: top;
}
.elc408-debug-log th {
  position: sticky;
  top: 0;
  z-index: 1;
  color: #647181;
  background: #edf2f7;
  font-size: 0.72rem;
  font-weight: 750;
  text-transform: uppercase;
}
.elc408-debug-log tbody tr:hover {
  background: #f6f8fb;
}
.elc408-hex {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  min-width: 0;
}
.elc408-hex-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
.elc408-hex-value {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.elc408-hex-value.expanded {
  overflow: visible;
  white-space: normal;
  overflow-wrap: anywhere;
}
.elc408-log-expand {
  flex: 0 0 auto;
  width: 30px;
  min-height: 24px;
  padding: 0 4px;
  border: 1px solid #c5cfdb;
  border-radius: 4px;
  color: #596575;
  background: #fff;
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.72rem;
  line-height: 1;
}
.elc408-log-expand:hover {
  border-color: #6e96c4;
  color: #3f6fa8;
  background: #f4f8fc;
}
.elc408-log-expand:focus-visible {
  outline: 2px solid rgba(79, 126, 182, 0.42);
  outline-offset: 1px;
}
.elc408-debug-log .send {
  color: #9a681d;
  font-weight: 700;
}
.elc408-debug-log .receive {
  color: #277455;
  font-weight: 700;
}
.elc408-success {
  margin: 0;
  color: #34805f;
  font-size: 0.8rem;
}
.elc408-error {
  margin: 0;
  color: #b35f68;
  font-size: 0.8rem;
}
.elc408-send-hint {
  margin: 0;
  color: #7a8694;
  font-size: 0.75rem;
}
@media (max-width: 760px) {
  .elc408-debug-panel {
    flex-direction: column;
    height: auto;
  }
  .elc408-debug-controls {
    width: 100%;
    flex: none;
    overflow: visible;
  }
  .elc408-debug-log {
    flex: none;
    height: 520px;
  }
}
</style>
