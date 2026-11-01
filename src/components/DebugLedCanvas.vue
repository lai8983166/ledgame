<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { debugLedGrid, fitDebugLedGrid, debugLedCellAt } from "../lib/debugLedGeometry.js";

const { t } = useI18n({ useScope: "global" });
const props = defineProps({
  disabled: { type: Boolean, default: false },
  hoverCell: { type: Object, default: null },
  pixels: { type: Array, default: () => [] },
  // The peripheral board owns its floor geometry. Do not fit that floor again.
  cellPitch: { type: Number, default: null },
});
const emit = defineEmits(["cell-click", "clear-hover", "hover-cell"]);
const canvasHost = ref(null);
const canvas = ref(null);
const matrixWidth = computed(() => props.pixels[0]?.length || 16);
const matrixHeight = computed(() => props.pixels.length || 16);
const canvasLayout = ref(debugLedGrid(1, 1, 0));
let animationFrame = 0;
let resizeObserver = null;
let lastHoverKey = "";
let unmounted = false;

onMounted(() => {
  resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvasHost.value);
  resizeCanvas();
});
onUnmounted(() => {
  unmounted = true;
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
});
watch(() => [props.pixels, props.hoverCell, props.disabled], scheduleDraw, { deep: true });
watch(() => [matrixWidth.value, matrixHeight.value, props.cellPitch], () => nextTick(resizeCanvas));

function resizeCanvas() {
  const host = canvasHost.value;
  if (unmounted || !host || !canvas.value) return;
  const bounds = host.getBoundingClientRect();
  canvasLayout.value = props.cellPitch == null
    ? fitDebugLedGrid(matrixWidth.value, matrixHeight.value, bounds.width, bounds.height)
    : debugLedGrid(matrixWidth.value, matrixHeight.value, props.cellPitch);
  nextTick(syncCanvasResolution);
}

function syncCanvasResolution() {
  const element = canvas.value;
  if (unmounted || !element) return;
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
  if (unmounted || animationFrame) return;
  animationFrame = requestAnimationFrame(() => {
    animationFrame = 0;
    draw();
  });
}

function draw() {
  const element = canvas.value;
  const context = element?.getContext("2d");
  const grid = canvasLayout.value;
  if (!context || !grid.pitch) return;
  // Raster resolution may be rounded for high DPI; logical grid geometry is not.
  context.setTransform(element.width / grid.width, 0, 0, element.height / grid.height, 0, 0);
  context.clearRect(0, 0, grid.width, grid.height);
  context.fillStyle = "#171c23";
  context.fillRect(0, 0, grid.width, grid.height);
  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.columns; x += 1) {
      const color = props.pixels[y]?.[x] || { r: 0, g: 0, b: 0 };
      context.fillStyle = `rgb(${color.r || 0}, ${color.g || 0}, ${color.b || 0})`;
      context.fillRect(grid.padding + x * grid.pitch, grid.padding + y * grid.pitch, grid.cellSize, grid.cellSize);
    }
  }
  const hover = props.hoverCell;
  if (hover && hover.x >= 0 && hover.x < grid.columns && hover.y >= 0 && hover.y < grid.rows) {
    context.strokeStyle = "rgba(217, 224, 234, 0.9)";
    context.lineWidth = Math.max(1, grid.width / 400);
    context.strokeRect(grid.padding + hover.x * grid.pitch, grid.padding + hover.y * grid.pitch, grid.cellSize, grid.cellSize);
  }
}

function cellFromPointer(event) {
  const element = canvas.value;
  if (!element) return null;
  const bounds = element.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const grid = canvasLayout.value;
  return debugLedCellAt(grid,
    (event.clientX - bounds.left) * grid.width / bounds.width,
    (event.clientY - bounds.top) * grid.height / bounds.height);
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
    <canvas ref="canvas" class="debug-led-canvas" :class="{ disabled }" :style="boardStyle"
      :aria-label="t('debug.canvasLabel')" @click="handleClick" @pointerleave="handlePointerLeave"
      @pointermove="handlePointerMove"></canvas>
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
  padding: 0;
  border: 0;
  background: #171c23;
  cursor: crosshair;
  touch-action: none;
}
.debug-led-canvas.disabled { cursor: default; }
</style>
