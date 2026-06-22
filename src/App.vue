<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import DemoView from "./views/DemoView.vue";
import MediaLibraryView from "./views/MediaLibraryView.vue";

const api = window.ledGame;
const isDebugWindow = api?.windowKind === "debug";
const engineState = ref("UNKNOWN");
const demoType = ref(null);
const busyAction = ref("");
const errorMessage = ref("");
const lastFrameAt = ref(null);
const pixels = ref(createBlankPixels());
const hoverCell = ref(null);
const activeView = ref("demo");
let removeLedFrameListener = null;
let removeEngineStateListener = null;

const frameAge = computed(() => {
  if (!lastFrameAt.value) {
    return "No frame";
  }
  const seconds = Math.max(
    0,
    Math.round((Date.now() - lastFrameAt.value) / 1000),
  );
  return `${seconds}s ago`;
});

onMounted(async () => {
  removeEngineStateListener = api?.onEngineState?.((state) => {
    applyState(state);
  });

  if (isDebugWindow) {
    removeLedFrameListener = api?.onLedFrame?.((frame) => {
      pixels.value = decodeFrame(frame);
      lastFrameAt.value = frame.receivedAt || Date.now();
    });
    const latestFrame = await api?.latestFrame?.();
    if (latestFrame) {
      pixels.value = decodeFrame(latestFrame);
      lastFrameAt.value = latestFrame.receivedAt || Date.now();
    }
  }

  await refreshState();
});

onUnmounted(() => {
  removeLedFrameListener?.();
  removeEngineStateListener?.();
  hoverCell.value = null;
});

async function runAction(name, action) {
  busyAction.value = name;
  errorMessage.value = "";
  try {
    const result = await action();
    applyState(result?.data);
  } catch (error) {
    errorMessage.value = error.message || String(error);
  } finally {
    busyAction.value = "";
  }
}

async function refreshState() {
  if (!api?.state) {
    return;
  }
  await runAction("state", () => api.state());
}

function applyState(state) {
  if (!state) {
    return;
  }
  engineState.value = state.engineState || engineState.value;
  demoType.value = state.demoType || null;
}

function startFixed() {
  return runAction("fixed", () => api.startFixed());
}

function startInput() {
  return runAction("input", () => api.startInput());
}

function stopEngine() {
  return runAction("stop", () => api.stop());
}

function openDebugPanel() {
  return runAction("debug", () => api.openDebugPanel());
}

function createBlankPixels() {
  return Array.from({ length: 16 }, () =>
    Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0 })),
  );
}

function decodeFrame(frame) {
  const rgb = frame?.rgb || [];
  const width = frame?.width || 16;
  const height = frame?.height || 16;
  const decoded = createBlankPixels();

  for (let y = 0; y < height && y < 16; y += 1) {
    for (let x = 0; x < width && x < 16; x += 1) {
      const index = (y * width + x) * 3;
      decoded[y][x] = {
        r: rgb[index] || 0,
        g: rgb[index + 1] || 0,
        b: rgb[index + 2] || 0,
      };
    }
  }

  return decoded;
}

function setHoverCell(x, y) {
  hoverCell.value = { x, y };
}

function clearHoverCell() {
  hoverCell.value = null;
}

function pressCell(x, y) {
  setHoverCell(x, y);
  sendCellInput("set", x, y);
}

function releaseCell(x, y) {
  sendCellInput("release", x, y);
}

function lightCell(x, y, color) {
  setHoverCell(x, y);
  sendCellInput("set", x, y, color);
}

function sendCellInput(type, x, y, color = { r: 255, g: 255, b: 255 }) {
  if (!api?.sendInput) {
    return;
  }
  api
    .sendInput({
      type,
      x,
      y,
      r: color.r,
      g: color.g,
      b: color.b,
    })
    .catch((error) => {
      errorMessage.value = error.message || String(error);
    });
}
</script>

<template>
  <DemoView
    v-if="isDebugWindow"
    :demo-type="demoType"
    :engine-state="engineState"
    :error-message="errorMessage"
    :frame-age="frameAge"
    :hover-cell="hoverCell"
    :is-debug-window="isDebugWindow"
    :pixels="pixels"
    @clear-hover-cell="clearHoverCell"
    @light-cell="lightCell"
    @press-cell="pressCell"
    @refresh-state="refreshState"
    @release-cell="releaseCell"
    @set-hover-cell="setHoverCell"
  />

  <main v-else class="app-shell">
    <header class="app-nav" aria-label="Primary">
      <div class="brand-mark" aria-hidden="true"></div>
      <nav class="nav-tabs">
        <button
          class="nav-tab"
          :class="{ active: activeView === 'demo' }"
          type="button"
          @click="activeView = 'demo'"
        >
          Demo
        </button>
        <button
          class="nav-tab"
          :class="{ active: activeView === 'media' }"
          type="button"
          @click="activeView = 'media'"
        >
          媒体库
        </button>
      </nav>
    </header>

    <DemoView
      v-if="activeView === 'demo'"
      :busy-action="busyAction"
      :demo-type="demoType"
      :engine-state="engineState"
      :error-message="errorMessage"
      @open-debug-panel="openDebugPanel"
      @refresh-state="refreshState"
      @start-fixed="startFixed"
      @start-input="startInput"
      @stop-engine="stopEngine"
    />

    <MediaLibraryView v-else />
  </main>
</template>
