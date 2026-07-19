<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  MAX_SPIRIT_DIMENSION,
  clampSpiritDimension,
  createSpiritCreatePayload,
  createSpiritUpdatePayload,
  cropSpiritPoints,
  parseSpiritPoints,
} from "../lib/spiritPoints.js";

const props = defineProps({
  spirit: { type: Object, required: true },
  creating: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["cancel", "save"]);
const { t } = useI18n();

const dialogRef = ref(null);
const canvasRef = ref(null);
const stageRef = ref(null);
const width = ref(1);
const height = ref(1);
const name = ref("");
const pointKeys = ref(new Set());
const stageSize = ref({ width: 0, height: 0 });
let resizeObserver = null;
let pointerId = null;
let paintMode = "on";
let lastPaintKey = "";

const pointCount = computed(() => pointKeys.value.size);
const canSave = computed(() => !props.saving && (!props.creating || name.value.trim().length > 0));

function resetDraft() {
  name.value = props.spirit?.name || "";
  width.value = clampSpiritDimension(props.spirit?.width);
  height.value = clampSpiritDimension(props.spirit?.height);
  const points = cropSpiritPoints(parseSpiritPoints(props.spirit?.points), width.value, height.value);
  pointKeys.value = new Set(points.map(([x, y]) => `${x}:${y}`));
  nextTick(drawCanvas);
}

function applyDimensionChange() {
  width.value = clampSpiritDimension(width.value);
  height.value = clampSpiritDimension(height.value);
  const cropped = [...pointKeys.value]
    .map((key) => key.split(":").map(Number))
    .filter(([x, y]) => x >= 0 && x < width.value && y >= 0 && y < height.value);
  pointKeys.value = new Set(cropped.map(([x, y]) => `${x}:${y}`));
  drawCanvas();
}

function canvasMetrics() {
  const availableWidth = Math.max(1, stageSize.value.width);
  const availableHeight = Math.max(1, stageSize.value.height);
  const cell = Math.max(1, Math.floor(Math.min(availableWidth / width.value, availableHeight / height.value)));
  return {
    cell,
    width: cell * width.value,
    height: cell * height.value,
  };
}

function drawCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }
  const metrics = canvasMetrics();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.style.width = `${metrics.width}px`;
  canvas.style.height = `${metrics.height}px`;
  canvas.width = Math.max(1, Math.round(metrics.width * dpr));
  canvas.height = Math.max(1, Math.round(metrics.height * dpr));
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#070a0f";
  context.fillRect(0, 0, metrics.width, metrics.height);
  for (let y = 0; y < height.value; y += 1) {
    for (let x = 0; x < width.value; x += 1) {
      if (pointKeys.value.has(`${x}:${y}`)) {
        context.fillStyle = "#4f8fce";
        context.fillRect(x * metrics.cell, y * metrics.cell, metrics.cell, metrics.cell);
      }
      context.strokeStyle = "rgba(180, 204, 230, 0.34)";
      context.lineWidth = 1;
      context.strokeRect(x * metrics.cell + 0.5, y * metrics.cell + 0.5, metrics.cell - 1, metrics.cell - 1);
    }
  }
}

function pointFromEvent(event) {
  const canvas = canvasRef.value;
  if (!canvas) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * width.value);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * height.value);
  if (x < 0 || x >= width.value || y < 0 || y >= height.value) {
    return null;
  }
  return { x, y, key: `${x}:${y}` };
}

function paintPoint(event) {
  const point = pointFromEvent(event);
  if (!point || point.key === lastPaintKey) {
    return;
  }
  lastPaintKey = point.key;
  const next = new Set(pointKeys.value);
  if (paintMode === "on") {
    next.add(point.key);
  } else {
    next.delete(point.key);
  }
  pointKeys.value = next;
  drawCanvas();
}

function handlePointerDown(event) {
  if (props.saving || event.button !== 0) {
    return;
  }
  const point = pointFromEvent(event);
  if (!point) {
    return;
  }
  event.preventDefault();
  pointerId = event.pointerId;
  paintMode = pointKeys.value.has(point.key) ? "off" : "on";
  lastPaintKey = "";
  canvasRef.value.setPointerCapture(event.pointerId);
  paintPoint(event);
}

function handlePointerMove(event) {
  if (pointerId !== event.pointerId) {
    return;
  }
  paintPoint(event);
}

function handlePointerUp(event) {
  if (pointerId !== event.pointerId) {
    return;
  }
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId);
  }
  pointerId = null;
  lastPaintKey = "";
}

function handleSave() {
  const points = [...pointKeys.value].map((key) => key.split(":").map(Number));
  emit(
    "save",
    props.creating
      ? createSpiritCreatePayload(name.value, width.value, height.value, points)
      : createSpiritUpdatePayload(width.value, height.value, points),
  );
}

function handleKeydown(event) {
  if (event.key === "Escape" && !props.saving) {
    emit("cancel");
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const focusable = [...(dialogRef.value?.querySelectorAll("button:not(:disabled), input:not(:disabled)") || [])];
  if (!focusable.length) {
    event.preventDefault();
    dialogRef.value?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(() => props.spirit, resetDraft, { immediate: true });
watch([width, height], applyDimensionChange);

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    stageSize.value = { width: entry.contentRect.width, height: entry.contentRect.height };
    drawCanvas();
  });
  if (stageRef.value) {
    resizeObserver.observe(stageRef.value);
  }
  window.addEventListener("keydown", handleKeydown);
  nextTick(() => dialogRef.value?.focus());
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="spirit-editor-backdrop" @mousedown.self="!saving && emit('cancel')">
    <section
      ref="dialogRef"
      class="spirit-editor-dialog"
      :class="{ creating }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spirit-editor-title"
      tabindex="-1"
    >
      <header class="spirit-editor-header">
        <div>
          <h2 id="spirit-editor-title">{{ creating
            ? t("spiritEditor.create")
            : t("spiritEditor.edit", { name: spirit.name || spirit.id })
          }}</h2>
          <p>{{ t("spiritEditor.pointCount", { count: pointCount }) }}</p>
        </div>
        <button class="inline-symbol-button" type="button" :title="t('common.close')" :disabled="saving" @click="emit('cancel')">×</button>
      </header>

      <label v-if="creating" class="spirit-editor-name">
        {{ t("spiritEditor.name") }}
        <input v-model="name" type="text" maxlength="255" :disabled="saving" autofocus />
      </label>

      <div class="spirit-editor-size-controls">
        <label>{{ t("spiritEditor.width") }} <input v-model.number="width" type="number" min="1" :max="MAX_SPIRIT_DIMENSION" :disabled="saving" /></label>
        <label>{{ t("spiritEditor.height") }} <input v-model.number="height" type="number" min="1" :max="MAX_SPIRIT_DIMENSION" :disabled="saving" /></label>
        <span>{{ width }} × {{ height }}</span>
      </div>

      <div ref="stageRef" class="spirit-editor-stage">
        <canvas
          ref="canvasRef"
          class="spirit-editor-canvas"
          :aria-label="t('spiritEditor.canvasLabel')"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointercancel="handlePointerUp"
          @wheel.prevent
        ></canvas>
      </div>

      <p v-if="error" class="spirit-editor-error">{{ error }}</p>
      <footer class="spirit-editor-actions">
        <button class="soft-button" type="button" :disabled="saving" @click="emit('cancel')">{{ t("common.cancel") }}</button>
        <button class="action-button primary" type="button" :disabled="!canSave" @click="handleSave">
          {{ t(saving ? "globalConfig.saving" : "common.save") }}
        </button>
      </footer>
    </section>
  </div>
</template>
