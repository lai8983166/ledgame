<script setup>
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps({
  mode: { type: String, default: "idle" },
});

const canvas = ref(null);
let animationFrame = 0;
let resizeObserver = null;
let startedAt = 0;

onMounted(() => {
  startedAt = performance.now();
  resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvas.value);
  resizeCanvas();
  draw(startedAt);
});

onUnmounted(() => {
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
});

watch(() => props.mode, () => {
  startedAt = performance.now();
});

function resizeCanvas() {
  const element = canvas.value;
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  element.width = Math.max(1, Math.round(rect.width * ratio));
  element.height = Math.max(1, Math.round(rect.height * ratio));
}

function draw(now) {
  const element = canvas.value;
  const context = element?.getContext("2d");
  if (!context) return;
  const width = element.width;
  const height = element.height;
  const elapsed = (now - startedAt) / 1000;
  context.fillStyle = "#071018";
  context.fillRect(0, 0, width, height);

  const columns = 18;
  const rows = Math.max(10, Math.round((height / width) * columns));
  const gap = Math.max(2, Math.round(width * 0.004));
  const cell = Math.max(8, Math.floor((width - gap * (columns - 1)) / columns));
  const palette = modePalette(props.mode);
  const offsetY = Math.floor((height - (rows * cell + (rows - 1) * gap)) / 2);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const diagonal = x + y;
      const wave = Math.sin(diagonal * 0.65 - elapsed * waveSpeed(props.mode));
      const paletteIndex = Math.floor(diagonal + elapsed * 4) % palette.length;
      context.globalAlpha = 0.18 + ((wave + 1) / 2) * 0.72;
      context.fillStyle = palette[(paletteIndex + palette.length) % palette.length];
      context.fillRect(x * (cell + gap), offsetY + y * (cell + gap), cell, cell);
    }
  }
  context.globalAlpha = 1;
  animationFrame = requestAnimationFrame(draw);
}

function modePalette(mode) {
  if (mode === "success") return ["#20d980", "#8ff0bb", "#ffffff"];
  if (mode === "failure") return ["#ff4f64", "#ff9a5a", "#ffffff"];
  if (mode === "settling") return ["#f5cf55", "#ffffff", "#4fc3f7"];
  if (mode === "running") return ["#39d98a", "#4fc3f7", "#ffffff"];
  if (mode === "starting") return ["#4fc3f7", "#8b7cff", "#ffffff"];
  return ["#ff5d73", "#ffbd4a", "#4bd37b", "#4fc3f7", "#8b7cff"];
}

function waveSpeed(mode) {
  return mode === "idle" ? 2.8 : mode === "running" ? 4.2 : 2.1;
}
</script>

<template>
  <canvas ref="canvas" class="touch-matrix-canvas" aria-hidden="true"></canvas>
</template>

<style scoped>
.touch-matrix-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
