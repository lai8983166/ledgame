<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  busyAction: {
    type: String,
    default: "",
  },
  demoType: {
    type: String,
    default: null,
  },
  engineState: {
    type: String,
    required: true,
  },
  errorMessage: {
    type: String,
    default: "",
  },
  frameAge: {
    type: String,
    default: "No frame",
  },
  hoverCell: {
    type: Object,
    default: null,
  },
  isDebugWindow: {
    type: Boolean,
    default: false,
  },
  pixels: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  "clear-hover-cell",
  "light-cell",
  "open-debug-panel",
  "press-cell",
  "refresh-state",
  "release-cell",
  "set-hover-cell",
  "start-fixed",
  "start-input",
  "stop-engine",
]);

const coordinateX = ref(0);
const coordinateY = ref(0);
const selectedColor = ref("#ffffff");

const isInputMode = computed(() =>
  String(props.demoType || "")
    .toLowerCase()
    .includes("input"),
);

function clampChannel(value) {
  return Math.min(255, Math.max(0, Number(value) || 0));
}

function clampCoordinate(value) {
  return Math.min(15, Math.max(0, Number(value) || 0));
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(color) {
  return `#${[color.r, color.g, color.b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

const selectedRgb = computed(() => hexToRgb(selectedColor.value));

function setColorChannel(channel, value) {
  selectedColor.value = rgbToHex({
    ...selectedRgb.value,
    [channel]: clampChannel(value),
  });
}

function emitLightCell(x, y) {
  if (!isInputMode.value) {
    return;
  }
  emit("light-cell", clampCoordinate(x), clampCoordinate(y), selectedRgb.value);
}

function colorStyle(color) {
  return {
    backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})`,
  };
}
</script>

<template>
  <main v-if="isDebugWindow" class="debug-shell">
    <header class="debug-topbar">
      <div>
        <h1>LED Debug</h1>
        <p>
          {{ engineState }}<span v-if="demoType"> / {{ demoType }}</span>
        </p>
      </div>
      <div class="frame-meta">{{ frameAge }}</div>
    </header>

    <section class="debug-workspace">
      <section class="panel-area">
        <div
          class="led-board"
          :class="{ disabled: !isInputMode }"
          @mouseleave="$emit('clear-hover-cell')"
        >
          <template v-for="(row, y) in pixels" :key="y">
            <button
              v-for="(color, x) in row"
              :key="`${x}-${y}`"
              class="led-cell"
              :class="{ active: hoverCell?.x === x && hoverCell?.y === y }"
              :disabled="!isInputMode"
              :style="colorStyle(color)"
              type="button"
              @click="emitLightCell(x, y)"
              @mouseenter="$emit('set-hover-cell', x, y)"
            />
          </template>
        </div>
      </section>

      <aside class="debug-controls" :class="{ disabled: !isInputMode }">
        <div class="debug-card">
          <div class="debug-card-head">
            <div>
              <p v-if="isInputMode">调色后直接点击面板</p>
              <p v-else>Start Input Demo to enable controls.</p>
            </div>
            <div
              class="color-preview"
              :style="{ backgroundColor: selectedColor }"
              aria-hidden="true"
            ></div>
          </div>

          <label class="color-picker">
            <span>Color</span>
            <input
              v-model="selectedColor"
              :disabled="!isInputMode"
              type="color"
            />
          </label>

          <div class="rgb-sliders">
            <label>
              <span>R {{ selectedRgb.r }}</span>
              <input
                :disabled="!isInputMode"
                :value="selectedRgb.r"
                max="255"
                min="0"
                type="range"
                @input="setColorChannel('r', $event.target.value)"
              />
            </label>
            <label>
              <span>G {{ selectedRgb.g }}</span>
              <input
                :disabled="!isInputMode"
                :value="selectedRgb.g"
                max="255"
                min="0"
                type="range"
                @input="setColorChannel('g', $event.target.value)"
              />
            </label>
            <label>
              <span>B {{ selectedRgb.b }}</span>
              <input
                :disabled="!isInputMode"
                :value="selectedRgb.b"
                max="255"
                min="0"
                type="range"
                @input="setColorChannel('b', $event.target.value)"
              />
            </label>
          </div>
        </div>

        <form
          class="debug-card coordinate-card"
          @submit.prevent="emitLightCell(coordinateX, coordinateY)"
        >
          <div class="debug-card-head">
            <div>
              <h2>坐标</h2>
            </div>
          </div>

          <div class="coordinate-fields">
            <label>
              <span>X</span>
              <input
                v-model.number="coordinateX"
                :disabled="!isInputMode"
                max="15"
                min="0"
                type="number"
              />
            </label>
            <label>
              <span>Y</span>
              <input
                v-model.number="coordinateY"
                :disabled="!isInputMode"
                max="15"
                min="0"
                type="number"
              />
            </label>
          </div>

          <button class="debug-action" :disabled="!isInputMode" type="submit">
            点亮
          </button>
        </form>
      </aside>
    </section>

    <footer class="debug-footer">
      <span v-if="hoverCell">x {{ hoverCell.x }} / y {{ hoverCell.y }}</span>
      <span v-else>16 x 16</span>
      <button
        class="ghost-button small"
        type="button"
        @click="$emit('refresh-state')"
      >
        Refresh
      </button>
    </footer>

    <p v-if="errorMessage" class="error-line">{{ errorMessage }}</p>
  </main>

  <section v-else class="workspace">
    <div class="page-heading">
      <div>
        <h1>Demo</h1>
        <p>
          {{ engineState }}<span v-if="demoType"> / {{ demoType }}</span>
        </p>
      </div>
      <button
        class="soft-button"
        type="button"
        :disabled="busyAction === 'debug'"
        @click="$emit('open-debug-panel')"
      >
        Debug Panel
      </button>
    </div>

    <section class="control-grid" aria-label="Demo controls">
      <button
        class="action-button primary"
        type="button"
        :disabled="Boolean(busyAction)"
        @click="$emit('start-fixed')"
      >
        Fixed Demo
      </button>
      <button
        class="action-button"
        type="button"
        :disabled="Boolean(busyAction)"
        @click="$emit('start-input')"
      >
        Input Demo
      </button>
      <button
        class="action-button danger"
        type="button"
        :disabled="Boolean(busyAction)"
        @click="$emit('stop-engine')"
      >
        Stop
      </button>
      <button
        class="action-button"
        type="button"
        :disabled="Boolean(busyAction)"
        @click="$emit('refresh-state')"
      >
        Refresh
      </button>
    </section>

    <p v-if="errorMessage" class="error-line">{{ errorMessage }}</p>
  </section>
</template>
