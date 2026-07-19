<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import ButtonMastery2_SelfMadeSystem from "../components/ButtonMastery2_SelfMadeSystem.vue";
import DebugLedCanvas from "../components/DebugLedCanvas.vue";

const { t } = useI18n({ useScope: "global" });

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
  frameSizeLabel: {
    type: String,
    default: "16 x 16",
  },
  gameplaySummary: {
    type: String,
    default: "",
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
  runtimeStatusItems: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  "clear-hover-cell",
  "game-input",
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
const matrixWidth = computed(() => props.pixels[0]?.length || 16);
const matrixHeight = computed(() => props.pixels.length || 16);
const previewModeLabel = computed(() => (isInputMode.value ? t("debug.inputDemo") : t("debug.runtimePreview")));
const canClickMatrix = computed(() => props.isDebugWindow);

function clampChannel(value) {
  return Math.min(255, Math.max(0, Number(value) || 0));
}

function clampCoordinate(value, max = 15) {
  return Math.min(max, Math.max(0, Number(value) || 0));
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
  const clampedX = clampCoordinate(x, matrixWidth.value - 1);
  const clampedY = clampCoordinate(y, matrixHeight.value - 1);
  if (isInputMode.value) {
    emit("light-cell", clampedX, clampedY, selectedRgb.value);
    return;
  }
  emit("game-input", clampedX, clampedY);
}

</script>

<template>
  <main v-if="isDebugWindow" class="debug-shell">
    <header class="debug-topbar">
      <div>
        <h1>{{ t("debug.ledPreview") }}</h1>
        <p>
          {{ engineState }}<span> / {{ previewModeLabel }}</span>
        </p>
      </div>
      <div class="frame-meta">
        <span>{{ frameSizeLabel }}</span>
        <span>{{ frameAge }}</span>
      </div>
    </header>

    <section class="debug-workspace">
      <section class="panel-area">
        <DebugLedCanvas
          :disabled="!canClickMatrix"
          :hover-cell="hoverCell"
          :pixels="pixels"
          @cell-click="emitLightCell"
          @clear-hover="$emit('clear-hover-cell')"
          @hover-cell="(x, y) => $emit('set-hover-cell', x, y)"
        />
      </section>

      <aside class="debug-side">
        <section class="debug-card runtime-state-card">
          <div class="debug-card-head">
            <div>
              <h2>{{ t("debug.runtimeState") }}</h2>
            </div>
          </div>
          <dl class="runtime-state-list">
            <div
              v-for="item in runtimeStatusItems"
              :key="item.label"
              class="runtime-state-row"
            >
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
        </section>

        <section class="debug-controls" :class="{ disabled: !isInputMode }">
          <div class="debug-card">
            <div class="debug-card-head">
              <div>
                <p v-if="isInputMode">{{ t("debug.adjustThenClick") }}</p>
                <p v-else>{{ t("debug.clickForInput") }}</p>
              </div>
              <div
                class="color-preview"
                :style="{ backgroundColor: selectedColor }"
                aria-hidden="true"
              ></div>
            </div>

            <label class="color-picker">
              <span>{{ t("debug.color") }}</span>
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
                <h2>{{ t("debug.coordinates") }}</h2>
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
              {{ t("debug.light") }}
            </button>
          </form>
        </section>
      </aside>
    </section>

    <footer class="debug-footer">
      <span v-if="hoverCell">x {{ hoverCell.x }} / y {{ hoverCell.y }}</span>
      <span v-else-if="gameplaySummary">{{ gameplaySummary }}</span>
      <span v-else>{{ frameSizeLabel }}</span>
      <button
        class="ghost-button small"
        type="button"
        @click="$emit('refresh-state')"
      >
        {{ t("debug.refresh") }}
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
        {{ t("debug.panel") }}
      </button>
    </div>

    <section class="control-grid" :aria-label="t('debug.controlsLabel')">
      <ButtonMastery2_SelfMadeSystem
        type="button"
        :disabled="Boolean(busyAction)"
        @click="$emit('start-fixed')"
      >
        {{ t("debug.fixedDemo") }}
      </ButtonMastery2_SelfMadeSystem>
      <ButtonMastery2_SelfMadeSystem
        type="button"
        :disabled="Boolean(busyAction)"
        @click="$emit('start-input')"
      >
        {{ t("debug.inputDemo") }}
      </ButtonMastery2_SelfMadeSystem>
      <ButtonMastery2_SelfMadeSystem
        class="danger"
        type="button"
        :disabled="Boolean(busyAction)"
        @click="$emit('stop-engine')"
      >
        {{ t("common.stop") }}
      </ButtonMastery2_SelfMadeSystem>
      <ButtonMastery2_SelfMadeSystem
        type="button"
        :disabled="Boolean(busyAction)"
        @click="$emit('refresh-state')"
      >
        {{ t("debug.refresh") }}
      </ButtonMastery2_SelfMadeSystem>
    </section>

    <p v-if="errorMessage" class="error-line">{{ errorMessage }}</p>
  </section>
</template>
