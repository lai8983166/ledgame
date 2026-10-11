<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { parseSpiritPoints, spiritColorCss } from '../lib/spiritPoints.js';

const props = defineProps({ spirit: { type: Object, required: true } });
const canvas = ref(null);
const color = computed(() => spiritColorCss(props.spirit.color));
function draw() {
  const context = canvas.value?.getContext('2d');
  if (!context) return;
  const points = parseSpiritPoints(props.spirit.points);
  const width = Math.max(1, Number(props.spirit.width) || 1);
  const height = Math.max(1, Number(props.spirit.height) || 1);
  const side = 240;
  const unit = Math.min((side - 16) / width, (side - 16) / height);
  const left = (side - width * unit) / 2, top = (side - height * unit) / 2;
  context.clearRect(0, 0, side, side);
  context.fillStyle = '#080d14';
  context.fillRect(left, top, width * unit, height * unit);
  context.fillStyle = color.value;
  const gap = Math.min(1.5, unit * .1);
  for (const [x, y] of points) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      context.fillRect(left + x * unit + gap / 2, top + y * unit + gap / 2, unit - gap, unit - gap);
    }
  }
}
onMounted(draw);
watch(() => [props.spirit.points, props.spirit.width, props.spirit.height, props.spirit.color], draw);
</script>

<template>
  <canvas ref="canvas" class="spirit-thumbnail" width="240" height="240" :data-color="color" aria-hidden="true"></canvas>
</template>

<style scoped>
.spirit-thumbnail { display:block; width:120px; height:120px; max-width:100%; aspect-ratio:1; object-fit:contain; }
</style>
