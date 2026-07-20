<script setup>
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  WIRING_MODES,
  createWiringDocument,
  setMode,
  resizeFrame,
  setMaxPointsPerChannel,
  appendPoint,
  appendRectangle,
  deletePoint,
  deleteRectangle,
  setActiveChannel,
  toDownloadPayload,
  summarizeChannels,
} from "../../lib/elc408/elc408Wiring.js";
import {
  classifyBackendErrorCode,
  extractBackendError,
} from "../../lib/elc408/elc408ToolsState.js";
import Elc408WiringCanvas from "./Elc408WiringCanvas.vue";

const { t } = useI18n({ useScope: "global" });
const api = window.elc408Tools;

const document = reactive(createWiringDocument());
const errorMessage = ref("");
const successMessage = ref("");
const infoMessage = ref(t("elc408.wiring.clickHint"));
const downloading = ref(false);

const channelSummaries = computed(() => summarizeChannels(document));

function onModeChange(mode) {
  const result = setMode(document, mode);
  if (result.ok) {
    Object.assign(document, result.document);
  }
}

function onWidthChange(event) {
  const next = Number(event.target.value);
  const result = resizeFrame(document, { width: next, height: document.height });
  if (!result.ok) {
    errorMessage.value = t("elc408.wiring.outOfBoundsWarning", { count: result.outOfBounds.length });
    event.target.value = String(document.width);
    return;
  }
  Object.assign(document, result.document);
  errorMessage.value = "";
}

function onHeightChange(event) {
  const next = Number(event.target.value);
  const result = resizeFrame(document, { width: document.width, height: next });
  if (!result.ok) {
    errorMessage.value = t("elc408.wiring.outOfBoundsWarning", { count: result.outOfBounds.length });
    event.target.value = String(document.height);
    return;
  }
  Object.assign(document, result.document);
  errorMessage.value = "";
}

function onMaxPointsChange(event) {
  const next = Number(event.target.value);
  const result = setMaxPointsPerChannel(document, next);
  if (!result.ok) {
    const over = result.overLimit[0];
    errorMessage.value = t("elc408.wiring.maxPointsExceeded", {
      lineIndex: over.lineIndex,
      current: over.currentCount,
      max: over.max,
    });
    event.target.value = String(document.maxPointsPerChannel);
    return;
  }
  Object.assign(document, result.document);
  errorMessage.value = "";
}

function onAppendPoint({ x, y }) {
  const result = appendPoint(document, x, y);
  if (result.ok) {
    Object.assign(document, result.document);
  }
}

function onAppendRectangle(rect) {
  const result = appendRectangle(document, rect.startX, rect.startY, rect.endX, rect.endY);
  if (result.ok) {
    Object.assign(document, result.document);
  }
}

function onDeletePoint({ x, y }) {
  const result = deletePoint(document, x, y);
  if (result.ok) {
    Object.assign(document, result.document);
  }
}

function onDeleteRectangle(rect) {
  const result = deleteRectangle(document, rect.startX, rect.startY, rect.endX, rect.endY);
  if (result.ok) {
    Object.assign(document, result.document);
  }
}

function selectChannel(index) {
  const result = setActiveChannel(document, index);
  Object.assign(document, result);
}

async function download() {
  downloading.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const payload = toDownloadPayload(document);
    const generated = await api.generateWiring(payload);
    if (generated?.code && generated.code !== 200) {
      errorMessage.value = generated.message || t("elc408.configuration.validationFailed");
      return;
    }
    const data = generated?.data || generated;
    const content = data?.content;
    if (!content) {
      errorMessage.value = t("elc408.configuration.validationFailed");
      return;
    }
    const saved = await api.saveGeneratedFile({
      kind: "wiring",
      suggestedFileName: data?.fileName || "wiring.json",
      content,
    });
    if (saved?.canceled) {
      successMessage.value = t("elc408.configuration.downloadCanceled");
      return;
    }
    successMessage.value = t("elc408.wiring.downloadSuccess", { fileName: saved.fileName });
  } catch (error) {
    const extracted = extractBackendError(error);
    const kind = classifyBackendErrorCode(extracted.code);
    errorMessage.value = t(`elc408.errors.${kind}`, { message: extracted.message });
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <div class="elc408-wiring-panel">
    <aside class="elc408-wiring-controls">
      <fieldset>
        <legend>{{ t("elc408.wiring.frameSize") }}</legend>
        <label>
          <span>{{ t("elc408.wiring.frameWidth") }}</span>
          <input
            :value="document.width"
            type="number"
            min="1"
            @change="onWidthChange"
          />
        </label>
        <label>
          <span>{{ t("elc408.wiring.frameHeight") }}</span>
          <input
            :value="document.height"
            type="number"
            min="1"
            @change="onHeightChange"
          />
        </label>
        <label>
          <span>{{ t("elc408.wiring.maxPointsPerChannel") }}</span>
          <input
            :value="document.maxPointsPerChannel"
            type="number"
            min="1"
            max="170"
            @change="onMaxPointsChange"
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>{{ t("elc408.wiring.wiringMode") }}</legend>
        <div class="elc408-mode-grid">
          <label
            v-for="mode in WIRING_MODES"
            :key="mode"
            :class="['elc408-mode-option', { active: document.mode === mode }]"
          >
            <input
              type="checkbox"
              :checked="document.mode === mode"
              @change="onModeChange(mode)"
            />
            <span>{{ t(`elc408.wiring.modes.${mode}`) }}</span>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>{{ t("elc408.wiring.channelsList") }}</legend>
        <ul class="elc408-channel-list">
          <li
            v-for="channel in channelSummaries"
            :key="channel.index"
            :class="{ active: channel.index === document.activeChannelIndex }"
            @click="selectChannel(channel.index)"
          >
            <span class="elc408-channel-no">{{ channel.index + 1 }}</span>
            <span class="elc408-channel-count">
              {{ t("elc408.wiring.pointCount") }}: {{ channel.pointCount }}
            </span>
          </li>
        </ul>
      </fieldset>
      <div class="elc408-actions">
        <button
          type="button"
          class="primary"
          :disabled="downloading"
          @click="download"
        >
          {{ downloading ? t("elc408.wiring.downloading") : t("elc408.wiring.download") }}
        </button>
      </div>
      <p v-if="successMessage" class="elc408-success">{{ successMessage }}</p>
      <p v-if="errorMessage" class="elc408-error">{{ errorMessage }}</p>
      <p v-else class="elc408-hint">{{ infoMessage }}</p>
    </aside>
    <Elc408WiringCanvas
      :document="document"
      @append-point="onAppendPoint"
      @append-rectangle="onAppendRectangle"
      @delete-point="onDeletePoint"
      @delete-rectangle="onDeleteRectangle"
    />
  </div>
</template>

<style scoped>
.elc408-wiring-panel {
  display: flex;
  gap: 18px;
  height: 100%;
  min-height: 0;
}
.elc408-wiring-controls {
  width: 304px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  padding: 2px 8px 2px 2px;
  scrollbar-gutter: stable;
}
.elc408-wiring-controls fieldset {
  margin: 0;
  padding: 12px;
  border: 1px solid #d6dee7;
  border-radius: 6px;
  background: #f5f8fb;
}
.elc408-wiring-controls legend {
  padding: 0 5px;
  color: #536071;
  font-size: 0.78rem;
  font-weight: 700;
}
.elc408-wiring-controls label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 6px 0;
  color: #596575;
  font-size: 0.81rem;
  font-weight: 570;
}
.elc408-wiring-controls input[type="number"] {
  width: 86px;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  outline: none;
  color: #344050;
  background: #fff;
}
.elc408-wiring-controls input[type="number"]:focus {
  border-color: #6e96c4;
  box-shadow: 0 0 0 3px rgba(79, 126, 182, 0.13);
}
.elc408-mode-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}
.elc408-mode-option {
  display: flex;
  justify-content: flex-start !important;
  gap: 9px !important;
  align-items: center;
  min-height: 34px;
  margin: 0 !important;
  padding: 0 9px;
  border: 1px solid #d8e0e9;
  border-radius: 6px;
  color: #596575;
  background: #fff;
  cursor: pointer;
}
.elc408-mode-option input {
  margin: 0;
  accent-color: #4f7eb6;
}
.elc408-mode-option.active {
  border-color: #8eacd0;
  color: #315d91;
  background: #e7eef7;
}
.elc408-channel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 210px;
  overflow: auto;
}
.elc408-channel-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 4px 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #596575;
  font-size: 0.8rem;
}
.elc408-channel-list li:hover {
  background: #edf2f7;
}
.elc408-channel-list li.active {
  border-color: #b7c9dd;
  background: #e2ebf5;
}
.elc408-channel-no {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 20px;
  flex: 0 0 32px;
  border: 1px solid rgba(52, 64, 80, 0.18);
  border-radius: 4px;
  color: #26313f;
  background: #ff6b6b;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.74rem;
  font-weight: 800;
}
.elc408-channel-list li:nth-child(2) .elc408-channel-no { background: #4ecdc4; }
.elc408-channel-list li:nth-child(3) .elc408-channel-no { background: #ffe66d; }
.elc408-channel-list li:nth-child(4) .elc408-channel-no { background: #a78bfa; }
.elc408-channel-list li:nth-child(5) .elc408-channel-no { background: #7bc043; }
.elc408-channel-list li:nth-child(6) .elc408-channel-no { background: #f49ac0; }
.elc408-channel-list li:nth-child(7) .elc408-channel-no { background: #76c4ae; }
.elc408-channel-list li:nth-child(8) .elc408-channel-no { background: #ffa94d; }
.elc408-channel-list li:nth-child(9) .elc408-channel-no { background: #90e0ef; }
.elc408-channel-list li:nth-child(10) .elc408-channel-no { background: #c8b6ff; }
.elc408-channel-count {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.elc408-actions {
  display: flex;
}
.elc408-actions button {
  flex: 1;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid #3f6fa8;
  border-radius: 6px;
  color: #fff;
  background: #4f7eb6;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 680;
  box-shadow: 0 3px 8px rgba(79, 126, 182, 0.2);
}
.elc408-actions button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
  box-shadow: none;
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
.elc408-hint {
  margin: 0;
  color: #7a8694;
  font-size: 0.78rem;
  line-height: 1.5;
}
@media (max-width: 760px) {
  .elc408-wiring-panel {
    flex-direction: column;
    height: auto;
  }
  .elc408-wiring-controls {
    width: 100%;
    flex: none;
    overflow: visible;
  }
  .elc408-wiring-panel :deep(.elc408-wiring-canvas) {
    flex: none;
    height: 480px;
  }
}
</style>
