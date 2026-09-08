<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  PIXEL_LIGHT_CHANNEL_COUNT,
  PIXEL_LIGHT_WALLS,
  buildPixelLightPreview,
  normalizePixelLightWiring,
  selectPixelLightRow,
  setPixelLightRowAlign,
  updatePixelLightWallCount,
  validatePixelLightWiring,
} from "../lib/pixelLightLayout.js";

const props = defineProps({
  layout: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  error: { type: String, default: "" },
  controllerCount: { type: Number, default: 2 },
  gridWidth: { type: Number, default: 16 },
  gridHeight: { type: Number, default: 16 },
});

const emit = defineEmits(["cancel", "save"]);
const { t } = useI18n({ useScope: "global" });
const dialogRef = ref(null);
const draft = ref(normalizePixelLightWiring(props.layout));
const preview = ref(buildPixelLightPreview(draft.value, props.gridWidth, props.gridHeight));
const validationErrors = ref([]);

const wallDefinitions = computed(() => PIXEL_LIGHT_WALLS.map((wall) => ({
  ...wall,
  label: t(`pixelLight.walls.${wall.key}`),
})));
const previewLabel = computed(() => t("pixelLight.preview"));
const alignPlaceholder = computed(() => t("pixelLight.alignPlaceholder"));
const controllerOptions = computed(() => {
  const count = Math.max(1, Number(props.controllerCount) || 1, draft.value.form.controlIdx + 1);
  return Array.from({ length: count }, (_, index) => ({ value: index, label: String(index + 1) }));
});
const channelOptions = computed(() => Array.from(
  { length: PIXEL_LIGHT_CHANNEL_COUNT },
  (_, index) => ({ value: index, label: String(index + 1) }),
));
const gridColumns = computed(() => Array.from({ length: preview.value.width + 1 }, (_, index) => index));
const gridRows = computed(() => Array.from({ length: preview.value.height + 1 }, (_, index) => index));
const symbolChainPoints = computed(() => preview.value.symbolChain
  .map((point) => `${point.x},${point.y}`)
  .join(" "));
const circleChainPoints = computed(() => preview.value.circleChain
  .map((point) => `${point.x},${point.y}`)
  .join(" "));
const wallError = computed(() => (field) => validationErrors.value.some((error) => error.field === field));
const rowError = computed(() => (row, suffix = "") => {
  const key = `${row.wall}|${row.idx}${suffix ? `.${suffix}` : ""}`;
  return validationErrors.value.some((error) => error.field === `rows.${key}`);
});

function resetDraft() {
  draft.value = normalizePixelLightWiring(props.layout);
  validationErrors.value = [];
  drawPreview();
}

function drawPreview() {
  const errors = validatePixelLightWiring(draft.value, {
    controllerCount: Math.max(1, Number(props.controllerCount) || 1),
    gridWidth: props.gridWidth,
    gridHeight: props.gridHeight,
  });
  validationErrors.value = errors;
  if (errors.length) {
    return;
  }
  preview.value = buildPixelLightPreview(draft.value, props.gridWidth, props.gridHeight);
}

function setWallCount(wall, event) {
  draft.value = updatePixelLightWallCount(draft.value, wall, Number(event.target.value));
  validationErrors.value = [];
}

function setController(event) {
  draft.value.form.controlIdx = Number(event.target.value);
}

function setChannel(field, event) {
  draft.value.form[field] = Number(event.target.value);
}

function setFlag(field, event) {
  draft.value.form[field] = event.target.checked ? 1 : 0;
}

function setOrder(event) {
  draft.value.form.order = Number(event.target.value) ? 1 : 0;
}

function setRowAlign(row, event) {
  draft.value = setPixelLightRowAlign(draft.value, row.wall, row.idx, event.target.value);
  validationErrors.value = validatePixelLightWiring(draft.value, {
    controllerCount: Math.max(1, Number(props.controllerCount) || 1),
    gridWidth: props.gridWidth,
    gridHeight: props.gridHeight,
  });
}

function selectStart(row) {
  if (row.idx !== 0) {
    return;
  }
  draft.value = selectPixelLightRow(draft.value, row.wall, row.idx);
  validationErrors.value = [];
}

function handleSave() {
  if (props.saving) {
    return;
  }
  const errors = validatePixelLightWiring(draft.value, {
    controllerCount: Math.max(1, Number(props.controllerCount) || 1),
    gridWidth: props.gridWidth,
    gridHeight: props.gridHeight,
  });
  validationErrors.value = errors;
  if (errors.length) {
    return;
  }
  emit("save", JSON.parse(JSON.stringify(normalizePixelLightWiring(draft.value))));
}

function rowErrorMessage(row) {
  const error = validationErrors.value.find((candidate) => candidate.field === `rows.${row.wall}|${row.idx}.align`);
  if (!error) {
    return "";
  }
  if (error.code === "ALIGN_REQUIRED") {
    return t("pixelLight.alignRequired");
  }
  if (error.code === "ALIGN_OUT_OF_RANGE") {
    return t("pixelLight.alignOutOfRange", { width: props.gridWidth, height: props.gridHeight });
  }
  return t("pixelLight.invalidAlign");
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    if (!props.saving) {
      emit("cancel");
    }
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const focusable = [...(dialogRef.value?.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)") || [])];
  if (!focusable.length) {
    event.preventDefault();
    dialogRef.value?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(() => props.layout, resetDraft, { deep: true });

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  nextTick(() => dialogRef.value?.focus());
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="pixel-layout-backdrop" @mousedown.self="!saving && emit('cancel')">
    <section
      ref="dialogRef"
      class="pixel-layout-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pixel-layout-title"
      tabindex="-1"
    >
      <header class="pixel-layout-header">
        <div>
          <h2 id="pixel-layout-title">{{ t("pixelLight.title") }}</h2>
          <p>{{ t("pixelLight.subtitle") }}</p>
        </div>
        <button class="inline-symbol-button" type="button" v-bind="{ title: t('common.close') }" :disabled="saving" @click="emit('cancel')">×</button>
      </header>

      <div class="pixel-layout-body">
        <section class="pixel-layout-controls">
          <div class="pixel-layout-section-head">
            <h3>{{ t("pixelLight.settings") }}</h3>
            <label class="pixel-layout-toggle">
              <input type="checkbox" :checked="Boolean(draft.form.open)" :disabled="saving" @change="setFlag('open', $event)" />
              <span>{{ draft.form.open ? t("pixelLight.enabled") : t("pixelLight.disabled") }}</span>
            </label>
          </div>

          <div class="pixel-layout-fields">
            <label>
              <span>{{ t("pixelLight.controller") }}</span>
              <select :value="draft.form.controlIdx" :disabled="saving" @change="setController">
                <option v-for="option in controllerOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>{{ t("pixelLight.pixelPort") }}</span>
              <select :value="draft.form.pixelPort" :disabled="saving" @change="setChannel('pixelPort', $event)">
                <option v-for="option in channelOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>{{ t("pixelLight.circlePort") }}</span>
              <select :value="draft.form.circlePort" :disabled="saving" @change="setChannel('circlePort', $event)">
                <option v-for="option in channelOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>{{ t("pixelLight.order") }}</span>
              <select :value="draft.form.order" :disabled="saving" @change="setOrder">
                <option :value="1">{{ t("pixelLight.clockwise") }}</option>
                <option :value="0">{{ t("pixelLight.counterClockwise") }}</option>
              </select>
            </label>
            <label class="pixel-layout-toggle pixel-layout-force-align">
              <input type="checkbox" :checked="Boolean(draft.form.forceAlign)" :disabled="saving" @change="setFlag('forceAlign', $event)" />
              <span>{{ t("pixelLight.forceAlign") }}</span>
            </label>
          </div>

          <p v-if="wallError('circlePort')" class="pixel-layout-error">{{ t("pixelLight.channelConflict") }}</p>

          <div class="pixel-layout-section-head pixel-layout-wall-head">
            <h3>{{ t("pixelLight.wallCounts") }}</h3>
            <span class="pixel-layout-hint">{{ t("pixelLight.gridSize", { width: preview.width, height: preview.height }) }}</span>
          </div>
          <div class="pixel-layout-wall-counts">
            <label v-for="wall in wallDefinitions" :key="wall.wall">
              <span>{{ wall.label }}</span>
              <input
                type="number"
                min="0"
                step="1"
                :value="draft.form[wall.formKey]"
                :disabled="saving"
                @change="setWallCount(wall.wall, $event)"
              />
            </label>
          </div>

          <div class="pixel-layout-rows-head">
            <h3>{{ t("pixelLight.rows") }}</h3>
            <p>{{ t("pixelLight.rowsHint") }}</p>
          </div>
          <div class="pixel-layout-rows">
            <div class="pixel-layout-row pixel-layout-row-header">
              <span>{{ t("pixelLight.start") }}</span>
              <span>{{ t("pixelLight.wall") }}</span>
              <span>{{ t("pixelLight.index") }}</span>
              <span>{{ t("pixelLight.align") }}</span>
            </div>
            <div v-for="row in draft.rows" :key="`${row.wall}|${row.idx}`" class="pixel-layout-row">
              <input
                type="radio"
                name="pixel-light-start"
                :checked="draft.selectedRow === `${row.wall}|${row.idx}`"
                :disabled="saving || row.idx !== 0"
                @change="selectStart(row)"
              />
              <span>{{ t(`pixelLight.walls.${PIXEL_LIGHT_WALLS[row.wall]?.key || 'top'}`) }}</span>
              <span>{{ row.idx + 1 }}</span>
              <div class="pixel-layout-align-field">
                <input
                  type="text"
                  :value="row.align"
                  v-bind="{ placeholder: alignPlaceholder }"
                  :class="{ invalid: rowError(row, 'align') || rowError(row) }"
                  :disabled="saving"
                  @input="setRowAlign(row, $event)"
                />
                <small v-if="rowErrorMessage(row)" class="pixel-layout-row-error">{{ rowErrorMessage(row) }}</small>
              </div>
            </div>
            <p v-if="!draft.rows.length" class="pixel-layout-empty">{{ t("pixelLight.noRows") }}</p>
          </div>
        </section>

        <section class="pixel-layout-preview-section">
          <div class="pixel-layout-section-head">
            <h3>{{ t("pixelLight.preview") }}</h3>
            <span class="pixel-layout-hint">{{ t("pixelLight.previewHint") }}</span>
          </div>
          <div class="pixel-layout-preview-wrap">
            <svg
              class="pixel-layout-preview"
              :viewBox="`0 0 ${preview.canvasWidth} ${preview.canvasHeight}`"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              v-bind="{ 'aria-label': previewLabel }"
            >
              <defs>
                <marker id="pixel-layout-symbol-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 z" fill="#ffb600" />
                </marker>
                <marker id="pixel-layout-circle-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 z" fill="#00e6e6" />
                </marker>
              </defs>
              <rect x="0" y="0" :width="preview.canvasWidth" :height="preview.canvasHeight" fill="#05080b" />
              <g class="pixel-layout-floor-grid">
                <rect :x="preview.floor.x" :y="preview.floor.y" :width="preview.floor.width" :height="preview.floor.height" fill="#06090c" stroke="#ffffff" stroke-width="1" />
                <line
                  v-for="x in gridColumns"
                  :key="`grid-x-${x}`"
                  :x1="preview.floor.x + x * preview.cellSize"
                  :y1="preview.floor.y"
                  :x2="preview.floor.x + x * preview.cellSize"
                  :y2="preview.floor.y + preview.floor.height"
                  stroke="#e7edf2"
                  stroke-width="0.7"
                />
                <line
                  v-for="y in gridRows"
                  :key="`grid-y-${y}`"
                  :x1="preview.floor.x"
                  :y1="preview.floor.y + y * preview.cellSize"
                  :x2="preview.floor.x + preview.floor.width"
                  :y2="preview.floor.y + y * preview.cellSize"
                  stroke="#e7edf2"
                  stroke-width="0.7"
                />
              </g>
              <g class="pixel-layout-walls">
                <rect
                  v-for="wall in preview.walls"
                  :key="`wall-${wall.wall}`"
                  :x="wall.x"
                  :y="wall.y"
                  :width="wall.width"
                  :height="wall.height"
                  fill="none"
                  :stroke="wall.color"
                  stroke-width="1.6"
                />
              </g>
              <polyline
                v-if="preview.symbolChain.length > 1"
                :points="symbolChainPoints"
                fill="none"
                stroke="#ffb600"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
                marker-end="url(#pixel-layout-symbol-arrow)"
              />
              <polyline
                v-if="preview.circleChain.length > 1"
                :points="circleChainPoints"
                fill="none"
                stroke="#00e6e6"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
                marker-end="url(#pixel-layout-circle-arrow)"
              />
              <g v-for="light in preview.lights" :key="light.key">
                <rect
                  :x="light.symbol.x - Math.max(3, preview.cellSize * 0.34)"
                  :y="light.symbol.y - Math.max(3, preview.cellSize * 0.34)"
                  :width="Math.max(6, preview.cellSize * 0.68)"
                  :height="Math.max(6, preview.cellSize * 0.68)"
                  rx="1"
                  :fill="light.selected ? '#ffd36b' : '#ffffff'"
                  stroke="#ffffff"
                  stroke-width="0.8"
                />
                <circle :cx="light.circle.x" :cy="light.circle.y" :r="Math.max(3, preview.cellSize * 0.28)" fill="#ffffff" stroke="#ffffff" stroke-width="0.8" />
              </g>
            </svg>
          </div>
        </section>
      </div>

      <p v-if="validationErrors.length" class="pixel-layout-error">{{ t("pixelLight.validationFailed") }}</p>
      <p v-if="error" class="pixel-layout-error">{{ error }}</p>

      <footer class="pixel-layout-actions">
        <button class="soft-button" type="button" :disabled="saving" @click="emit('cancel')">{{ t("common.cancel") }}</button>
        <button class="soft-button" type="button" :disabled="saving" @click="drawPreview">{{ t("pixelLight.draw") }}</button>
        <button class="action-button primary" type="button" :disabled="saving" @click="handleSave">
          {{ t(saving ? "globalConfig.saving" : "common.save") }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.pixel-layout-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(14, 23, 32, 0.62);
}

.pixel-layout-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: 14px;
  width: min(1240px, 100%);
  height: min(900px, 96vh);
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  background: #eef3f6;
  box-shadow: 0 26px 80px rgba(10, 20, 30, 0.42);
  outline: none;
}

.pixel-layout-header,
.pixel-layout-section-head,
.pixel-layout-rows-head,
.pixel-layout-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pixel-layout-header h2,
.pixel-layout-section-head h3,
.pixel-layout-rows-head h3 {
  margin: 0;
  color: #2d3d4b;
}

.pixel-layout-header h2 { font-size: 19px; }
.pixel-layout-section-head h3,
.pixel-layout-rows-head h3 { font-size: 14px; }
.pixel-layout-header p,
.pixel-layout-rows-head p,
.pixel-layout-hint,
.pixel-layout-preview-note {
  margin: 4px 0 0;
  color: #778694;
  font-size: 12px;
}

.pixel-layout-body {
  display: grid;
  grid-template-columns: minmax(420px, 0.95fr) minmax(430px, 1.05fr);
  gap: 18px;
  min-height: 0;
  overflow: hidden;
}

.pixel-layout-controls,
.pixel-layout-preview-section {
  min-width: 0;
  min-height: 0;
  padding: 14px;
  border-radius: 13px;
  background: #e5ebf0;
  box-shadow: inset 3px 3px 7px rgba(175, 187, 198, 0.32), inset -3px -3px 7px rgba(255, 255, 255, 0.76);
}

.pixel-layout-controls { overflow: auto; }
.pixel-layout-preview-section { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
.pixel-layout-fields,
.pixel-layout-wall-counts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.pixel-layout-fields label,
.pixel-layout-wall-counts label { display: grid; gap: 5px; color: #526474; font-size: 12px; font-weight: 650; }
.pixel-layout-fields .pixel-layout-force-align {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  min-height: 34px;
}
.pixel-layout-fields select,
.pixel-layout-wall-counts input,
.pixel-layout-row input[type="text"] {
  min-height: 34px;
  border: 1px solid rgba(164, 178, 190, 0.75);
  border-radius: 9px;
  background: #f0f4f7;
  color: #324655;
  padding: 0 9px;
}
.pixel-layout-wall-counts input { width: 94px; }
.pixel-layout-toggle { display: flex; align-items: center; gap: 7px; color: #526474; font-size: 12px; font-weight: 650; }
.pixel-layout-toggle input { width: 15px; height: 15px; margin: 0; accent-color: #397c8a; }
.pixel-layout-force-align span { line-height: 34px; }
.pixel-layout-wall-head { margin-top: 18px; }
.pixel-layout-rows-head { margin-top: 18px; align-items: flex-start; }
.pixel-layout-rows-head p { max-width: 260px; text-align: right; }
.pixel-layout-rows { margin-top: 8px; border: 1px solid rgba(164, 178, 190, 0.64); border-radius: 10px; overflow: auto; background: rgba(245, 248, 250, 0.68); }
.pixel-layout-row { display: grid; grid-template-columns: 58px minmax(70px, 1fr) 62px minmax(110px, 1.5fr); align-items: center; gap: 8px; min-height: 40px; padding: 5px 9px; border-bottom: 1px solid rgba(164, 178, 190, 0.34); color: #526474; font-size: 12px; }
.pixel-layout-row:last-child { border-bottom: 0; }
.pixel-layout-row-header { min-height: 32px; background: rgba(193, 207, 216, 0.44); font-weight: 700; }
.pixel-layout-row input[type="radio"] { justify-self: center; accent-color: #397c8a; }
.pixel-layout-row input[type="text"].invalid { border-color: #c96773; background: #fff1f2; }
.pixel-layout-align-field { display: grid; gap: 3px; min-width: 0; }
.pixel-layout-row-error { color: #b84e5d; font-size: 11px; line-height: 1.25; }
.pixel-layout-empty { margin: 0; padding: 18px; color: #7a8995; text-align: center; font-size: 12px; }
.pixel-layout-preview-wrap { min-height: 0; display: grid; place-items: center; padding: 12px; overflow: auto; border-radius: 10px; background: #0a121a; }
.pixel-layout-preview { display: block; width: 100%; height: 100%; min-height: 360px; }
.pixel-layout-error { margin: 0; color: #b84e5d; font-size: 12px; }
.pixel-layout-actions { justify-content: flex-end; }

@media (max-width: 900px) {
  .pixel-layout-dialog { height: 96vh; padding: 14px; }
  .pixel-layout-body { grid-template-columns: 1fr; overflow: auto; }
  .pixel-layout-preview-section { min-height: 420px; }
}
</style>
