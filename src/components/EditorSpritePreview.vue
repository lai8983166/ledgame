<script setup>
import { computed } from "vue";

const props = defineProps({
  sprite: {
    type: Object,
    required: true,
  },
  color: {
    type: String,
    default: "#70d6b3",
  },
});

const width = computed(() => Math.max(1, Number(props.sprite?.width) || 1));
const height = computed(() => Math.max(1, Number(props.sprite?.height) || 1));
const pointSet = computed(() => new Set(
  (Array.isArray(props.sprite?.points) ? props.sprite.points : [])
    .map((point) => `${Number(point?.[0])}:${Number(point?.[1])}`),
));
const cells = computed(() => Array.from(
  { length: width.value * height.value },
  (_value, index) => {
    const x = index % width.value;
    const y = Math.floor(index / width.value);
    return { key: `${x}:${y}`, active: pointSet.value.has(`${x}:${y}`) };
  },
));
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${width.value}, minmax(0, 1fr))`,
  aspectRatio: `${width.value} / ${height.value}`,
  "--editor-sprite-color": props.color,
}));
</script>

<template>
  <div class="editor-sprite-preview" :style="gridStyle" aria-hidden="true">
    <span
      v-for="cell in cells"
      :key="cell.key"
      class="editor-sprite-preview-cell"
      :class="{ active: cell.active }"
    ></span>
  </div>
</template>

<style scoped>
.editor-sprite-preview {
  display: grid;
  width: min(100%, 132px);
  max-height: 132px;
  gap: 1px;
  margin: 0 auto;
}

.editor-sprite-preview-cell {
  min-width: 0;
  min-height: 0;
  border-radius: 1px;
  background: rgba(113, 128, 145, 0.16);
}

.editor-sprite-preview-cell.active {
  background: var(--editor-sprite-color);
  box-shadow: 0 0 4px color-mix(in srgb, var(--editor-sprite-color) 55%, transparent);
}
</style>
