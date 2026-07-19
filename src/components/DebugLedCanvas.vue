<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n({ useScope: "global" });

const props = defineProps({
  disabled: { type: Boolean, default: false },
  hoverCell: { type: Object, default: null },
  pixels: { type: Array, default: () => [] },
});

const emit = defineEmits(["cell-click", "clear-hover", "hover-cell"]);
const canvas = ref(null);
const matrixWidth = computed(() => props.pixels[0]?.length || 16);
const matrixHeight = computed(() => props.pixels.length || 16);
let animationFrame = 0;
let resizeObserver = null;
let lastHoverKey = "";

onMounted(() => {
  resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvas.value);
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

function resizeCanvas() {
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
      const left = metrics.padding + x * (metrics.cellWidth + metrics.gap);
      const top = metrics.padding + y * (metrics.cellHeight + metrics.gap);
      context.fillStyle = `rgb(${color.r || 0}, ${color.g || 0}, ${color.b || 0})`;
      context.fillRect(left, top, metrics.cellWidth, metrics.cellHeight);
    }
  }

  const hover = props.hoverCell;
  if (hover && hover.x >= 0 && hover.y >= 0) {
    const left = metrics.padding + hover.x * (metrics.cellWidth + metrics.gap);
    const top = metrics.padding + hover.y * (metrics.cellHeight + metrics.gap);
    context.strokeStyle = "rgba(217, 224, 234, 0.9)";
    context.lineWidth = Math.max(2, element.width / 400);
    context.strokeRect(left, top, metrics.cellWidth, metrics.cellHeight);
  }
}

function canvasMetrics(width, height) {
  const ratio = width / Math.max(1, canvas.value?.getBoundingClientRect().width || width);
  const padding = 14 * ratio;
  const gap = 4 * ratio;
  return {
    padding,
    gap,
    cellWidth: Math.max(1, (width - padding * 2 - gap * (matrixWidth.value - 1)) / matrixWidth.value),
    cellHeight: Math.max(1, (height - padding * 2 - gap * (matrixHeight.value - 1)) / matrixHeight.value),
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
  const x = Math.floor((pointX - metrics.padding) / (metrics.cellWidth + metrics.gap));
  const y = Math.floor((pointY - metrics.padding) / (metrics.cellHeight + metrics.gap));
  if (x < 0 || y < 0 || x >= matrixWidth.value || y >= matrixHeight.value) return null;
  const cellRight = metrics.padding + x * (metrics.cellWidth + metrics.gap) + metrics.cellWidth;
  const cellBottom = metrics.padding + y * (metrics.cellHeight + metrics.gap) + metrics.cellHeight;
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
</script>

<template>
  <canvas
    ref="canvas"
    class="led-board debug-led-canvas"
    :class="{ disabled }"
    :style="{ aspectRatio: `${matrixWidth} / ${matrixHeight}` }"
    :aria-label="t('debug.canvasLabel')"
    @click="handleClick"
    @pointerleave="handlePointerLeave"
    @pointermove="handlePointerMove"
  ></canvas>
</template>

<style scoped>
.debug-led-canvas {
  display: block;
  padding: 0;
  cursor: crosshair;
  touch-action: none;
}

.debug-led-canvas.disabled {
  cursor: default;
}
</style>
