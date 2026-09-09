<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  DEFAULT_EFFECT_CONFIG,
  expandEffectFrames,
  filterEffectSprites,
  normalizeEffectConfig,
  resolveEffectSprite,
  validateEffectConfig,
} from "../lib/effectEditor.js";

const props = defineProps({
  effect: { type: Object, default: () => ({ ...DEFAULT_EFFECT_CONFIG }) },
  spirits: { type: Array, default: () => [] },
  gridWidth: { type: Number, default: 16 },
  gridHeight: { type: Number, default: 16 },
  levelIndex: { type: Number, default: 0 },
  frameIndex: { type: Number, default: 0 },
  colors: { type: Array, default: () => ["#00ff00", "#0000ff", "#ff0000", "#a000ff"] },
  idPrefix: { type: String, default: "effect" },
  saving: { type: Boolean, default: false },
  error: { type: String, default: "" },
});

const emit = defineEmits(["cancel", "confirm"]);
const { t } = useI18n({ useScope: "global" });
const dialogRef = ref(null);
const draft = ref(normalizeEffectConfig(props.effect));
const validationErrors = ref([]);
const previewFrames = ref([]);
const previewFrameIndex = ref(0);
let previewTimer = 0;

const availableSprites = computed(() => filterEffectSprites(props.spirits, draft.value.color));
const selectedSprite = computed(() => resolveEffectSprite(props.spirits, draft.value));
const previewFrame = computed(() => previewFrames.value[previewFrameIndex.value] || null);
const colorOptions = computed(() => [0, 1, 2, 3].map((value) => ({
  value,
  label: t(`effect.colors.color${value}`),
  swatch: props.colors[value] || ["#00ff00", "#0000ff", "#ff0000", "#a000ff"][value],
})));
const previewCells = computed(() => {
  const cellMap = new Map();
  for (const object of previewFrame.value?.matrix || []) {
    for (const point of object.points || [[0, 0]]) {
      const x = Number(object.x) + Number(point[0] || 0);
      const y = Number(object.y) + Number(point[1] || 0);
      if (x < 0 || y < 0 || x >= props.gridWidth || y >= props.gridHeight) {
        continue;
      }
      cellMap.set(`${x}:${y}`, { x, y, color: Number(object.color) || 0 });
    }
  }
  const cells = [];
  for (let y = 0; y < props.gridHeight; y += 1) {
    for (let x = 0; x < props.gridWidth; x += 1) {
      const active = cellMap.get(`${x}:${y}`);
      cells.push({
        key: `${x}:${y}`,
        x,
        y,
        active: Boolean(active),
        color: active?.color ?? draft.value.color,
      });
    }
  }
  return cells;
});
const previewGridStyle = computed(() => {
  const width = Math.max(1, Number(props.gridWidth) || 1);
  const height = Math.max(1, Number(props.gridHeight) || 1);
  // Keep every preview tile square. The grid itself is allowed to become
  // scrollable for larger playfields instead of stretching rows or columns.
  const cellSize = Math.max(6, Math.min(24, Math.floor(Math.min(520 / width, 520 / height))));
  return {
    gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
  };
});

function fieldError(field) {
  return validationErrors.value.find((error) => error.field === field) || null;
}

function errorMessage(field) {
  const error = fieldError(field);
  if (!error) {
    return "";
  }
  const messages = {
    COORDINATE_OUT_OF_RANGE: t("effect.errors.coordinate"),
    STEP_INVALID: t("effect.errors.step"),
    DIMENSION_INVALID: t("effect.errors.dimension"),
    MODE_INVALID: t("effect.errors.mode"),
    SPRITE_UNAVAILABLE: t("effect.errors.spriteUnavailable"),
    SPRITE_REQUIRED: t("effect.errors.spriteRequired"),
    SPRITE_EMPTY: t("effect.errors.spriteEmpty"),
    SPRITE_POINTS_OUT_OF_BOUNDS: t("effect.errors.spriteBounds"),
    FOOTPRINT_OUT_OF_RANGE: t("effect.errors.footprint"),
  };
  return messages[error.code] || t("effect.errors.invalid");
}

function stopPreviewTimer() {
  if (previewTimer) {
    window.clearInterval(previewTimer);
    previewTimer = 0;
  }
}

function startPreviewTimer() {
  stopPreviewTimer();
  if (previewFrames.value.length <= 1) {
    return;
  }
  previewTimer = window.setInterval(() => {
    previewFrameIndex.value = (previewFrameIndex.value + 1) % previewFrames.value.length;
  }, 300);
}

function rebuildPreview() {
  stopPreviewTimer();
  previewFrameIndex.value = 0;
  const sprite = selectedSprite.value;
  validationErrors.value = validateEffectConfig(draft.value, {
    gridWidth: props.gridWidth,
    gridHeight: props.gridHeight,
    spirits: props.spirits,
    sprite,
  });
  if (validationErrors.value.length) {
    previewFrames.value = [];
    return;
  }
  previewFrames.value = expandEffectFrames(draft.value, {
    gridWidth: props.gridWidth,
    gridHeight: props.gridHeight,
    spirits: props.spirits,
    idPrefix: props.idPrefix,
  });
  startPreviewTimer();
}

function resetSpriteSelection(force = false) {
  const candidates = availableSprites.value;
  if (!candidates.length) {
    draft.value.spriteId = "";
    return;
  }
  const hasCurrent = candidates.some((sprite) => sprite.id === draft.value.spriteId);
  if (force || !hasCurrent) {
    draft.value.spriteId = candidates[0].id;
  }
}

function setColor(value, event) {
  // These controls are intentionally checkboxes for a clear, touch-friendly
  // presentation, but the effect still has exactly one active color.
  if (!event.target.checked) {
    event.target.checked = true;
    return;
  }
  if (draft.value.color === value) {
    return;
  }
  draft.value.color = value;
  resetSpriteSelection(true);
}

function setUseSprite(event) {
  draft.value.useSprite = event.target.checked;
  if (draft.value.useSprite) {
    resetSpriteSelection(false);
    if (selectedSprite.value) {
      draft.value.width = selectedSprite.value.width;
      draft.value.height = selectedSprite.value.height;
    }
  }
}

function setSprite(event) {
  draft.value.spriteId = event.target.value;
  if (selectedSprite.value && draft.value.useSprite) {
    draft.value.width = selectedSprite.value.width;
    draft.value.height = selectedSprite.value.height;
  }
}

function drawPreview() {
  rebuildPreview();
}

function handleConfirm() {
  if (props.saving) {
    return;
  }
  rebuildPreview();
  if (validationErrors.value.length) {
    return;
  }
  emit("confirm", {
    config: JSON.parse(JSON.stringify(draft.value)),
    frames: JSON.parse(JSON.stringify(previewFrames.value)),
  });
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
  if (event.shiftKey && window.document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && window.document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(() => props.effect, (value) => {
  draft.value = normalizeEffectConfig(value);
  resetSpriteSelection(false);
  rebuildPreview();
}, { deep: true });

watch(() => draft.value.color, () => {
  resetSpriteSelection(true);
  rebuildPreview();
});

watch(draft, rebuildPreview, { deep: true });
watch(() => props.spirits, () => {
  resetSpriteSelection(false);
  rebuildPreview();
}, { deep: true });

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  resetSpriteSelection(false);
  rebuildPreview();
  nextTick(() => dialogRef.value?.focus());
});

onBeforeUnmount(() => {
  stopPreviewTimer();
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="game-effect-backdrop" @mousedown.self="!saving && emit('cancel')">
    <section
      ref="dialogRef"
      class="game-effect-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-effect-title"
      tabindex="-1"
    >
      <header class="game-effect-header">
        <div>
          <h2 id="game-effect-title">{{ t("effect.title") }}</h2>
          <p>{{ t("effect.subtitle") }}</p>
          <p class="game-effect-target">{{ t("effect.targetFrame", { level: levelIndex + 1, frame: frameIndex + 1 }) }}</p>
        </div>
        <button class="inline-symbol-button" type="button" :title="t('common.close')" :disabled="saving" @click="emit('cancel')">×</button>
      </header>

      <div class="game-effect-body">
        <section class="game-effect-form">
          <div class="game-effect-section-head">
            <h3>{{ t("effect.settings") }}</h3>
            <span class="game-effect-grid-size">{{ t("effect.gridSize", { width: gridWidth, height: gridHeight }) }}</span>
          </div>

          <fieldset class="game-effect-color-fieldset">
            <legend>{{ t("effect.color") }}</legend>
            <div class="game-effect-color-options" role="group" :aria-label="t('effect.color')">
              <label v-for="option in colorOptions" :key="option.value" class="game-effect-color-option">
                <input
                  type="checkbox"
                  :checked="draft.color === option.value"
                  :disabled="saving"
                  @change="setColor(option.value, $event)"
                />
                <span class="game-effect-color-swatch" :style="{ backgroundColor: option.swatch }" aria-hidden="true"></span>
                <span>{{ option.label }}</span>
              </label>
            </div>
          </fieldset>

          <div class="game-effect-coordinate-grid">
            <label>
              <span>{{ t("effect.startX") }}</span>
              <input v-model.number="draft.startX" type="number" min="1" :max="gridWidth" :disabled="saving" />
              <small v-if="fieldError('startX')" class="game-effect-field-error">{{ errorMessage('startX') }}</small>
            </label>
            <label>
              <span>{{ t("effect.startY") }}</span>
              <input v-model.number="draft.startY" type="number" min="1" :max="gridHeight" :disabled="saving" />
              <small v-if="fieldError('startY')" class="game-effect-field-error">{{ errorMessage('startY') }}</small>
            </label>
            <label>
              <span>{{ t("effect.endX") }}</span>
              <input v-model.number="draft.endX" type="number" min="1" :max="gridWidth" :disabled="saving" />
              <small v-if="fieldError('endX')" class="game-effect-field-error">{{ errorMessage('endX') }}</small>
            </label>
            <label>
              <span>{{ t("effect.endY") }}</span>
              <input v-model.number="draft.endY" type="number" min="1" :max="gridHeight" :disabled="saving" />
              <small v-if="fieldError('endY')" class="game-effect-field-error">{{ errorMessage('endY') }}</small>
            </label>
          </div>

          <div class="game-effect-coordinate-grid">
            <label>
              <span>{{ t("effect.width") }}</span>
              <input v-model.number="draft.width" type="number" min="1" :max="gridWidth" :disabled="saving || draft.useSprite" />
              <small v-if="fieldError('width')" class="game-effect-field-error">{{ errorMessage('width') }}</small>
            </label>
            <label>
              <span>{{ t("effect.height") }}</span>
              <input v-model.number="draft.height" type="number" min="1" :max="gridHeight" :disabled="saving || draft.useSprite" />
              <small v-if="fieldError('height')" class="game-effect-field-error">{{ errorMessage('height') }}</small>
            </label>
            <label>
              <span>{{ t("effect.step") }}</span>
              <input v-model.number="draft.step" type="number" min="0.01" step="0.01" :disabled="saving" />
              <small v-if="fieldError('step')" class="game-effect-field-error">{{ errorMessage('step') }}</small>
            </label>
            <label>
              <span>{{ t("effect.mode") }}</span>
              <select v-model="draft.mode" :disabled="saving">
                <option value="insert">{{ t("effect.insert") }}</option>
                <option value="merge">{{ t("effect.merge") }}</option>
              </select>
            </label>
          </div>

          <label class="game-effect-checkbox">
            <input type="checkbox" :checked="draft.useSprite" :disabled="saving" @change="setUseSprite" />
            <span>{{ t("effect.useSprite") }}</span>
          </label>
          <label v-if="draft.useSprite">
            <span>{{ t("effect.sprite") }}</span>
            <select :value="draft.spriteId" :disabled="saving || !availableSprites.length" @change="setSprite">
              <option v-for="sprite in availableSprites" :key="sprite.id" :value="sprite.id">{{ sprite.name }}</option>
            </select>
            <small v-if="fieldError('spriteId')" class="game-effect-field-error">{{ errorMessage('spriteId') }}</small>
          </label>

          <div class="game-effect-help">
            <span>{{ t("effect.coordinateHint") }}</span>
            <span v-if="selectedSprite">{{ t("effect.spriteSize", { width: selectedSprite.width, height: selectedSprite.height }) }}</span>
          </div>
        </section>

        <section class="game-effect-preview-section">
          <div class="game-effect-section-head">
            <h3>{{ t("effect.preview") }}</h3>
            <span class="game-effect-grid-size">
              {{ previewFrames.length ? t("effect.frameProgress", { current: previewFrameIndex + 1, total: previewFrames.length }) : t("effect.noPreview") }}
            </span>
          </div>
          <div class="game-effect-preview-stage">
            <div class="game-effect-preview-grid" :style="previewGridStyle" role="img" :aria-label="t('effect.preview')">
              <span
                v-for="cell in previewCells"
                :key="cell.key"
                class="game-effect-preview-cell"
                :class="{ active: cell.active }"
                :style="cell.active ? { backgroundColor: colorOptions[cell.color]?.swatch } : undefined"
              />
            </div>
          </div>
          <p v-if="validationErrors.length" class="game-effect-validation-summary">{{ t("effect.validationFailed") }}</p>
          <p v-if="error" class="game-effect-validation-summary">{{ error }}</p>
        </section>
      </div>

      <footer class="game-effect-actions">
        <button class="soft-button" type="button" :disabled="saving" @click="emit('cancel')">{{ t("common.cancel") }}</button>
        <button class="soft-button" type="button" :disabled="saving" @click="drawPreview">{{ t("effect.draw") }}</button>
        <button class="action-button primary" type="button" :disabled="saving" @click="handleConfirm">{{ t(saving ? "globalConfig.saving" : "effect.confirm") }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.game-effect-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(14, 23, 32, 0.62);
}

.game-effect-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  width: min(1080px, 100%);
  height: min(760px, 96vh);
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  background: #eef3f6;
  box-shadow: 0 26px 80px rgba(10, 20, 30, 0.42);
  outline: none;
}

.game-effect-header,
.game-effect-section-head,
.game-effect-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.game-effect-header h2,
.game-effect-header p,
.game-effect-section-head h3 {
  margin: 0;
}

.game-effect-header h2,
.game-effect-section-head h3 {
  color: #2d3d4b;
}

.game-effect-header h2 { font-size: 20px; }
.game-effect-header p,
.game-effect-grid-size,
.game-effect-help { color: #74808e; font-size: 12px; }

.game-effect-header .game-effect-target { color: #4b6f94; font-weight: 700; }

.game-effect-body {
  display: grid;
  grid-template-columns: minmax(300px, 0.9fr) minmax(360px, 1.1fr);
  gap: 18px;
  min-height: 0;
}

.game-effect-form,
.game-effect-preview-section {
  min-width: 0;
  min-height: 0;
  padding: 16px;
  border: 1px solid rgba(190, 199, 212, 0.72);
  border-radius: 14px;
  background: #f5f7fa;
}

.game-effect-form {
  display: grid;
  align-content: start;
  gap: 12px;
  overflow: auto;
}

.game-effect-form label {
  display: grid;
  gap: 5px;
  color: #596574;
  font-size: 13px;
  font-weight: 700;
}

.game-effect-form select,
.game-effect-form input {
  min-width: 0;
}

.game-effect-color-fieldset {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
}

.game-effect-color-fieldset legend {
  padding: 0;
  color: #596574;
  font-size: 13px;
  font-weight: 700;
}

.game-effect-color-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.game-effect-color-option {
  display: flex !important;
  grid-template-columns: none;
  align-items: center;
  gap: 8px !important;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #d8dee7;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.game-effect-color-option input {
  width: auto;
  flex: none;
}

.game-effect-color-swatch {
  width: 14px;
  height: 14px;
  flex: none;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 50%;
}

.game-effect-coordinate-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.game-effect-checkbox {
  display: flex !important;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px !important;
}

.game-effect-checkbox input {
  width: auto;
}

.game-effect-field-error,
.game-effect-validation-summary {
  color: #a04f59;
  font-size: 12px;
  font-weight: 600;
}

.game-effect-help {
  display: grid;
  gap: 4px;
  margin-top: 4px;
}

.game-effect-preview-section {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 12px;
}

.game-effect-preview-stage {
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 18px;
  overflow: auto;
  border-radius: 12px;
  background: #10151b;
}

.game-effect-preview-grid {
  display: grid;
  width: max-content;
  height: max-content;
  flex: none;
  gap: 2px;
  padding: 2px;
  background: #39424d;
}

.game-effect-preview-cell {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border-radius: 2px;
  background: #202831;
}

.game-effect-preview-cell.active {
  box-shadow: 0 0 8px currentColor;
}

.game-effect-actions {
  justify-content: flex-end;
}

@media (max-width: 820px) {
  .game-effect-dialog { height: 96vh; }
  .game-effect-body { grid-template-columns: 1fr; overflow: auto; }
  .game-effect-preview-section { min-height: 360px; }
}
</style>
