<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  advanceLevelPreviewState,
  createLevelPreviewState,
  normalizePreviewRepeatTimes,
  rasterizeLevelPreviewFrame,
  SIMPLE_TICK_MS,
} from "../lib/simpleLevelPreview.js";

const props = defineProps({
  snapshot: {
    type: Object,
    required: true,
  },
});
const emit = defineEmits(["close"]);
const { t } = useI18n({ useScope: "global" });

const canvasRef = ref(null);
const playbackState = ref(createLevelPreviewState(props.snapshot.frames));
let timer = null;

const frames = computed(() => props.snapshot.frames || []);
const currentFrame = computed(() => {
  if (!playbackState.value) {
    return null;
  }
  return frames.value[playbackState.value.frameIndex] || null;
});
const currentRepeatTotal = computed(() => normalizePreviewRepeatTimes(currentFrame.value?.repeatTimes));

onMounted(() => {
  restartPlayback();
});

onBeforeUnmount(() => {
  stopPlayback();
});

watch(
  () => props.snapshot,
  () => restartPlayback(),
);

watch([playbackState, () => props.snapshot], () => {
  void nextTick(drawCurrentFrame);
}, { deep: true });

function restartPlayback() {
  stopPlayback();
  playbackState.value = createLevelPreviewState(frames.value);
  void nextTick(drawCurrentFrame);
  if (!playbackState.value) {
    return;
  }
  timer = window.setInterval(() => {
    playbackState.value = advanceLevelPreviewState(playbackState.value, frames.value);
  }, SIMPLE_TICK_MS);
}

function stopPlayback() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function drawCurrentFrame() {
  const canvas = canvasRef.value;
  const frame = currentFrame.value;
  if (!canvas || !frame) {
    return;
  }
  const width = props.snapshot.width;
  const height = props.snapshot.height;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    return;
  }
  const pixels = rasterizeLevelPreviewFrame(frame, props.snapshot);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
}

function close() {
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div class="simple-level-preview-backdrop" @click.self="close">
      <section
        class="simple-level-preview-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('simple.levelPreviewTitle')"
        @keydown.esc="close"
      >
        <header>
          <div>
            <h2>{{ t("simple.levelPreviewTitle") }}</h2>
            <p v-if="snapshot.label">{{ snapshot.label }}</p>
          </div>
          <button autofocus type="button" :aria-label="t('simple.closePreview')" @click="close">×</button>
        </header>

        <div v-if="playbackState" class="simple-level-preview-stage">
          <canvas
            ref="canvasRef"
            class="simple-level-preview-canvas"
            :aria-label="t('simple.levelPreviewCanvas')"
          ></canvas>
        </div>
        <p v-else class="simple-level-preview-empty">{{ t("simple.levelPreviewEmpty") }}</p>

        <footer v-if="playbackState" aria-live="off">
          <strong>{{ t("simple.levelPreviewFrameProgress", {
            current: playbackState.frameIndex + 1,
            total: frames.length,
          }) }}</strong>
          <span>{{ t("simple.levelPreviewRepeatProgress", {
            current: playbackState.repeatIndex + 1,
            total: currentRepeatTotal,
          }) }}</span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.simple-level-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(12, 17, 23, 0.72);
}

.simple-level-preview-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(760px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  padding: 18px;
  border: 1px solid #3e4b5c;
  border-radius: 8px;
  background: #171d25;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.34);
}

.simple-level-preview-dialog header,
.simple-level-preview-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.simple-level-preview-dialog h2,
.simple-level-preview-dialog p {
  margin: 0;
}

.simple-level-preview-dialog h2 {
  color: #f2f5f8;
  font-size: 1rem;
}

.simple-level-preview-dialog header p {
  margin-top: 4px;
  color: #96a4b5;
  font-size: 0.78rem;
}

.simple-level-preview-dialog header button {
  width: 34px;
  height: 34px;
  border: 1px solid #4b596a;
  border-radius: 6px;
  color: #dce3eb;
  background: #222b36;
  cursor: pointer;
  font-size: 1.25rem;
}

.simple-level-preview-stage {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 14px;
  border: 1px solid #303b49;
  border-radius: 6px;
  background: #090c10;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
}

.simple-level-preview-canvas {
  display: block;
  width: auto;
  height: min(62vh, 620px);
  max-width: 100%;
  max-height: calc(100vh - 190px);
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  pointer-events: none;
}

.simple-level-preview-dialog footer {
  color: #aab5c2;
  font-size: 0.84rem;
}

.simple-level-preview-dialog footer strong {
  color: #f2f5f8;
}

.simple-level-preview-empty {
  display: grid;
  min-height: 240px;
  place-items: center;
  color: #96a4b5;
}
</style>
