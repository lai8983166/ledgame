<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n({ useScope: "global" });

const props = defineProps({
  disabled: { type: Boolean, default: false },
  hoverCell: { type: Object, default: null },
  pixels: { type: Array, default: () => [] },
});

const emit = defineEmits(["cell-click", "clear-hover", "hover-cell"]);
const canvasHost = ref(null);
const canvas = ref(null);
const matrixWidth = computed(() => props.pixels[0]?.length || 16);
const matrixHeight = computed(() => props.pixels.length || 16);
const canvasLayout = ref({ width: 1, height: 1, padding: 0, gap: 0 });
let animationFrame = 0;
let resizeObserver = null;
let lastHoverKey = "";

onMounted(() => {
  resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvasHost.value);
  resizeCanvas();
});

onUnmounted(() => {
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
});

watch(
  () => [props.pixels, props.hoverCell, props.disabled],
  scheduleDraw,
  { deep: true },
);

watch(
  () => [matrixWidth.value, matrixHeight.value],
  () => nextTick(resizeCanvas),
);

function resizeCanvas() {
  const host = canvasHost.value;
  const element = canvas.value;
  if (!host || !element) return;
  const hostBounds = host.getBoundingClientRect();
  const layout = fitCanvasLayout(hostBounds.width, hostBounds.height);
  canvasLayout.value = layout;
  nextTick(syncCanvasResolution);
}

function syncCanvasResolution() {
  const element = canvas.value;
  if (!element) return;
  const bounds = element.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (element.width !== width || element.height !== height) {
    element.width = width;
    element.height = height;
  }
  scheduleDraw();
}

function fitCanvasLayout(hostWidth, hostHeight) {
  const width = Math.max(1, Math.floor(hostWidth));
  const height = Math.max(1, Math.floor(hostHeight));
  const columns = Math.max(1, matrixWidth.value);
  const rows = Math.max(1, matrixHeight.value);
  const padding = Math.min(14, Math.max(2, Math.floor(Math.min(width, height) / 24)));
  const gap = Math.min(4, Math.max(1, Math.floor(Math.min(width / columns, height / rows) / 4)));
  const availableWidth = Math.max(1, width - padding * 2 - gap * (columns - 1));
  const availableHeight = Math.max(1, height - padding * 2 - gap * (rows - 1));
  const cellSize = Math.max(1, Math.floor(Math.min(availableWidth / columns, availableHeight / rows)));
  return {
    width: Math.min(width, padding * 2 + columns * cellSize + gap * (columns - 1)),
    height: Math.min(height, padding * 2 + rows * cellSize + gap * (rows - 1)),
    padding,
    gap,
  };
}

function scheduleDraw() {
  if (animationFrame) return;
  animationFrame = requestAnimationFrame(() => {
    animationFrame = 0;
    draw();
  });
}

function draw() {
  const element = canvas.value;
  const context = element?.getContext("2d");
  if (!context) return;

  const metrics = canvasMetrics(element.width, element.height);
  context.clearRect(0, 0, element.width, element.height);
  context.fillStyle = "#171c23";
  context.fillRect(0, 0, element.width, element.height);

  for (let y = 0; y < matrixHeight.value; y += 1) {
    for (let x = 0; x < matrixWidth.value; x += 1) {
      const color = props.pixels[y]?.[x] || { r: 0, g: 0, b: 0 };
      const left = metrics.paddingX + x * (metrics.cellWidth + metrics.gap);
      const top = metrics.paddingY + y * (metrics.cellHeight + metrics.gap);
      context.fillStyle = `rgb(${color.r || 0}, ${color.g || 0}, ${color.b || 0})`;
      context.fillRect(left, top, metrics.cellWidth, metrics.cellHeight);
    }
  }

  const hover = props.hoverCell;
  if (hover && hover.x >= 0 && hover.y >= 0) {
    const left = metrics.paddingX + hover.x * (metrics.cellWidth + metrics.gap);
    const top = metrics.paddingY + hover.y * (metrics.cellHeight + metrics.gap);
    context.strokeStyle = "rgba(217, 224, 234, 0.9)";
    context.lineWidth = Math.max(2, element.width / 400);
    context.strokeRect(left, top, metrics.cellWidth, metrics.cellHeight);
  }
}

function canvasMetrics(width, height) {
  const bounds = canvas.value?.getBoundingClientRect();
  const scaleX = width / Math.max(1, bounds?.width || width);
  const scaleY = height / Math.max(1, bounds?.height || height);
  const paddingX = canvasLayout.value.padding * scaleX;
  const paddingY = canvasLayout.value.padding * scaleY;
  const gapX = canvasLayout.value.gap * scaleX;
  const gapY = canvasLayout.value.gap * scaleY;
  const availableWidth = Math.max(1, width - paddingX * 2 - gapX * (matrixWidth.value - 1));
  const availableHeight = Math.max(1, height - paddingY * 2 - gapY * (matrixHeight.value - 1));
  const cellSize = Math.max(1, Math.min(
    availableWidth / matrixWidth.value,
    availableHeight / matrixHeight.value,
  ));
  const gap = Math.min(gapX, gapY);
  const boardWidth = matrixWidth.value * cellSize + gap * (matrixWidth.value - 1);
  const boardHeight = matrixHeight.value * cellSize + gap * (matrixHeight.value - 1);
  return {
    paddingX: Math.max(0, Math.floor((width - boardWidth) / 2)),
    paddingY: Math.max(0, Math.floor((height - boardHeight) / 2)),
    gap,
    cellWidth: cellSize,
    cellHeight: cellSize,
  };
}

function cellFromPointer(event) {
  const element = canvas.value;
  if (!element) return null;
  const bounds = element.getBoundingClientRect();
  const scaleX = element.width / Math.max(1, bounds.width);
  const scaleY = element.height / Math.max(1, bounds.height);
  const pointX = (event.clientX - bounds.left) * scaleX;
  const pointY = (event.clientY - bounds.top) * scaleY;
  const metrics = canvasMetrics(element.width, element.height);
  const x = Math.floor((pointX - metrics.paddingX) / (metrics.cellWidth + metrics.gap));
  const y = Math.floor((pointY - metrics.paddingY) / (metrics.cellHeight + metrics.gap));
  if (x < 0 || y < 0 || x >= matrixWidth.value || y >= matrixHeight.value) return null;
  const cellRight = metrics.paddingX + x * (metrics.cellWidth + metrics.gap) + metrics.cellWidth;
  const cellBottom = metrics.paddingY + y * (metrics.cellHeight + metrics.gap) + metrics.cellHeight;
  return pointX <= cellRight && pointY <= cellBottom ? { x, y } : null;
}

function handlePointerMove(event) {
  if (props.disabled) return;
  const cell = cellFromPointer(event);
  const key = cell ? `${cell.x}:${cell.y}` : "";
  if (key === lastHoverKey) return;
  lastHoverKey = key;
  if (cell) emit("hover-cell", cell.x, cell.y);
  else emit("clear-hover");
}

function handlePointerLeave() {
  lastHoverKey = "";
  emit("clear-hover");
}

function handleClick(event) {
  if (props.disabled) return;
  const cell = cellFromPointer(event);
  if (cell) emit("cell-click", cell.x, cell.y);
}

const boardStyle = computed(() => ({
  width: `${canvasLayout.value.width}px`,
  height: `${canvasLayout.value.height}px`,
}));
</script>

<template>
  <div ref="canvasHost" class="debug-led-canvas-host">
    <canvas
      ref="canvas"
      class="debug-led-canvas"
      :class="{ disabled }"
      :style="boardStyle"
      :aria-label="t('debug.canvasLabel')"
      @click="handleClick"
      @pointerleave="handlePointerLeave"
      @pointermove="handlePointerMove"
    ></canvas>
  </div>
</template>

<style scoped>
.debug-led-canvas-host {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.debug-led-canvas {
  display: block;
  flex: none;
  max-width: 100%;
  max-height: 100%;
  padding: 0;
  border: 0;
  border-radius: 24px;
  background: #171c23;
  box-shadow:
    inset 11px 11px 24px rgba(6, 8, 11, 0.58),
    inset -10px -10px 24px rgba(52, 60, 72, 0.42);
  cursor: crosshair;
  touch-action: none;
}

.debug-led-canvas.disabled {
  cursor: default;
}
</style>
