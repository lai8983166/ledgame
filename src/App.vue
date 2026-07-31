<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import DemoView from "./views/DemoView.vue";
import GameListView from "./views/GameListView.vue";
import MediaLibraryView from "./views/MediaLibraryView.vue";
import SimpleGameEditorView from "./views/SimpleGameEditorView.vue";
import SpiritLibraryView from "./views/SpiritLibraryView.vue";
import LedGameTouchView from "./views/LedGameTouchView.vue";
import LanguageView from "./views/LanguageView.vue";
import Elc408DebugAssistantView from "./views/Elc408DebugAssistantView.vue";
import DatabaseRefreshView from "./views/DatabaseRefreshView.vue";
import ApplicationSettingsView from "./views/ApplicationSettingsView.vue";
import SecondaryDisplayView from "./views/SecondaryDisplayView.vue";
import SecondaryDisplayPickerDialog from "./components/SecondaryDisplayPickerDialog.vue";

const { t } = useI18n({ useScope: "global" });

const api = window.ledGame;
const isDebugWindow = api?.windowKind === "debug";
const isTouchWindow = api?.windowKind === "touch";
const isSecondaryWindow = api?.windowKind === "secondary";
const engineState = ref("UNKNOWN");
const demoType = ref(null);
const busyAction = ref("");
const errorMessage = ref("");
const frameState = ref(createFrameState());
const hoverCell = ref(null);
const gameRuntimeState = ref(null);
const activeView = ref("demo");
const selectedEditorGame = ref(null);
const helpMenuOpen = ref(false);
const helpButtonRef = ref(null);
const helpMenuRef = ref(null);
const secondaryMenuOpen = ref(false);
const secondaryButtonRef = ref(null);
const secondaryMenuRef = ref(null);
const secondaryPickerOpen = ref(false);
const secondaryDisplayState = ref({
  displays: [],
  selectedId: null,
  selectedAvailable: false,
  windowOpen: false,
});
const secondaryErrorMessage = ref("");
let removeHelpMenuListeners = null;
let removeLedFrameListener = null;
let removeEngineStateListener = null;
let removeSecondaryDisplayListener = null;

const frameAge = computed(() => {
  if (!frameState.value.receivedAt) {
    return t("debug.noFrame");
  }
  const seconds = Math.max(
    0,
    Math.round((Date.now() - frameState.value.receivedAt) / 1000),
  );
  return t("debug.secondsAgo", { seconds });
});
const frameSizeLabel = computed(() => `${frameState.value.width} x ${frameState.value.height}`);
const gameplaySummary = computed(() => {
  const gameplay = gameRuntimeState.value?.gameplay;
  if (!gameplay) {
    return "";
  }
  const parts = [
    t("debug.summaryScore", { value: gameplay.score ?? 0 }),
    t("debug.summaryLife", { value: gameplay.life ?? 0 }),
    t("debug.summaryPhase", { value: gameplay.phase || "-" }),
  ];
  if (gameplay.lastInput?.outcome) {
    parts.push(t("debug.summaryLast", { value: gameplay.lastInput.outcome }));
  }
  return parts.join(" / ");
});
const debugErrorMessage = computed(() => errorMessage.value);
const runtimeStatusItems = computed(() => {
  const state = gameRuntimeState.value || {};
  const gameplay = state.gameplay || {};
  const lastInput = gameplay.lastInput || {};
  return [
    { label: t("debug.running"), value: state.running ? t("debug.runningValue") : t("debug.stoppedValue") },
    { label: "Game ID", value: formatRuntimeValue(state.gameId) },
    { label: "Game", value: formatRuntimeValue(state.gameName || state.gameType) },
    { label: t("debug.startLevel"), value: formatRuntimeValue(state.startLevelIndex) },
    { label: t("debug.launchMethod"), value: formatRuntimeValue(state.launchMethod) },
    { label: t("debug.phase"), value: formatRuntimeValue(gameplay.phase) },
    { label: t("debug.score"), value: formatRuntimeValue(gameplay.score, "0") },
    { label: t("debug.life"), value: formatRuntimeValue(gameplay.life, "0") },
    { label: t("debug.lastClick"), value: formatRuntimeValue(lastInput.outcome) },
  ];
});

onMounted(async () => {
  if (isTouchWindow || isSecondaryWindow) {
    return;
  }
  removeEngineStateListener = api?.onEngineState?.((state) => {
    applyState(state);
  });

  if (isDebugWindow) {
    removeLedFrameListener = api?.onLedFrame?.((frame) => {
      frameState.value = decodeFrame(frame);
    });
    const latestFrame = await api?.latestFrame?.();
    if (latestFrame) {
      frameState.value = decodeFrame(latestFrame);
    }
  }

  attachHelpMenuListeners();
  removeSecondaryDisplayListener =
    window.secondaryDisplay?.onChanged?.((state) => applySecondaryDisplayState(state)) || null;
  await Promise.all([refreshState(), refreshSecondaryDisplayState()]);
});

onUnmounted(() => {
  removeLedFrameListener?.();
  removeEngineStateListener?.();
  removeSecondaryDisplayListener?.();
  removeHelpMenuListeners?.();
  hoverCell.value = null;
});

function attachHelpMenuListeners() {
  function onDocumentClick(event) {
    if (!helpMenuOpen.value && !secondaryMenuOpen.value) {
      return;
    }
    if (helpMenuOpen.value) {
      const menu = helpMenuRef.value;
      const button = helpButtonRef.value;
      if (
        (menu && event.target instanceof Node && menu.contains(event.target)) ||
        (button && event.target instanceof Node && button.contains(event.target))
      ) {
        return;
      }
      closeHelpMenu();
    }
    if (secondaryMenuOpen.value) {
      const menu = secondaryMenuRef.value;
      const button = secondaryButtonRef.value;
      if (
        (menu && event.target instanceof Node && menu.contains(event.target)) ||
        (button && event.target instanceof Node && button.contains(event.target))
      ) {
        return;
      }
      closeSecondaryMenu();
    }
  }
  function onKeydown(event) {
    if (event.key === "Escape") {
      if (helpMenuOpen.value) {
        closeHelpMenu();
        helpButtonRef.value?.focus();
      }
      if (secondaryMenuOpen.value) {
        closeSecondaryMenu();
        secondaryButtonRef.value?.focus();
      }
    }
  }
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
  removeHelpMenuListeners = () => {
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onKeydown);
  };
}

function toggleHelpMenu() {
  helpMenuOpen.value ? closeHelpMenu() : openHelpMenu();
}

function openHelpMenu() {
  closeSecondaryMenu();
  helpMenuOpen.value = true;
}

function closeHelpMenu() {
  helpMenuOpen.value = false;
}

function selectHelpItem(view) {
  activeView.value = view;
  closeHelpMenu();
}

function onHelpButtonKeydown(event) {
  if (!helpMenuOpen.value && (event.key === "Enter" || event.key === " " || event.key === "ArrowDown")) {
    event.preventDefault();
    openHelpMenu();
  }
}

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
  const requests = [];
  if (api?.state) {
    requests.push(runAction("state", () => api.state()));
  }
  await Promise.all(requests);
}

function applyState(state) {
  if (!state) {
    return;
  }
  engineState.value = state.engineState || engineState.value;
  if ("demoType" in state) {
    demoType.value = state.demoType || null;
  }
  if ("gameId" in state || "gameplay" in state || state.gameType || state.gameName) {
    gameRuntimeState.value = state;
  }
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

function enterGameFlow() {
  if (!api?.enterGameFlow) {
    errorMessage.value = t("debug.entryApiUnavailable");
    return;
  }
  return runAction("game-flow", () => api.enterGameFlow());
}

function openSimpleEditor(game) {
  selectedEditorGame.value = game ? { id: game.id, name: game.name } : null;
  activeView.value = "simple-editor";
}

function toggleSecondaryMenu() {
  secondaryMenuOpen.value ? closeSecondaryMenu() : openSecondaryMenu();
}

function openSecondaryMenu() {
  closeHelpMenu();
  secondaryMenuOpen.value = true;
}

function closeSecondaryMenu() {
  secondaryMenuOpen.value = false;
}

function onSecondaryButtonKeydown(event) {
  if (
    !secondaryMenuOpen.value &&
    (event.key === "Enter" || event.key === " " || event.key === "ArrowDown")
  ) {
    event.preventDefault();
    openSecondaryMenu();
  }
}

function showSecondaryDisplayList() {
  closeSecondaryMenu();
  secondaryPickerOpen.value = true;
}

function applySecondaryDisplayState(state) {
  if (!state) return;
  secondaryDisplayState.value = {
    ...secondaryDisplayState.value,
    ...state,
    displays: Array.isArray(state.displays) ? state.displays : [],
  };
  if ("error" in state) {
    secondaryErrorMessage.value = state.error
      ? t(`secondaryDisplay.errors.${state.error}`)
      : "";
  }
}

async function refreshSecondaryDisplayState() {
  if (!window.secondaryDisplay?.list) return;
  try {
    applySecondaryDisplayState(await window.secondaryDisplay.list());
  } catch (error) {
    secondaryErrorMessage.value =
      error?.message || t("secondaryDisplay.listFailed");
  }
}

async function openSecondaryDisplay() {
  if (
    !window.secondaryDisplay?.open ||
    !secondaryDisplayState.value.selectedAvailable ||
    busyAction.value
  ) {
    return;
  }
  closeSecondaryMenu();
  busyAction.value = "secondary-display";
  secondaryErrorMessage.value = "";
  try {
    applySecondaryDisplayState(await window.secondaryDisplay.open());
  } catch (error) {
    const code = error?.message || "";
    secondaryErrorMessage.value =
      code === "SECONDARY_DISPLAY_UNAVAILABLE"
        ? t("secondaryDisplay.errors.SECONDARY_DISPLAY_UNAVAILABLE")
        : code || t("secondaryDisplay.openFailed");
  } finally {
    busyAction.value = "";
  }
}

function backToGameList() {
  selectedEditorGame.value = null;
  activeView.value = "games";
}

function createFrameState(width = 16, height = 16, receivedAt = null) {
  return {
    width,
    height,
    receivedAt,
    pixels: createBlankPixels(width, height),
  };
}

function createBlankPixels(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ r: 0, g: 0, b: 0 })),
  );
}

function decodeFrame(frame) {
  const rgb = frame?.rgb || [];
  const fallbackSize = inferFrameSize(rgb.length);
  const width = clampFrameDimension(frame?.width || fallbackSize.width);
  const height = clampFrameDimension(frame?.height || fallbackSize.height);
  const decoded = createBlankPixels(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      decoded[y][x] = {
        r: rgb[index] || 0,
        g: rgb[index + 1] || 0,
        b: rgb[index + 2] || 0,
      };
    }
  }

  return {
    width,
    height,
    receivedAt: frame?.receivedAt || Date.now(),
    pixels: decoded,
  };
}

function inferFrameSize(byteLength) {
  const pixelCount = Math.floor((Number(byteLength) || 0) / 3);
  const squareSize = Math.sqrt(pixelCount);
  if (Number.isInteger(squareSize) && squareSize > 0) {
    return { width: squareSize, height: squareSize };
  }
  return { width: 16, height: 16 };
}

function clampFrameDimension(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 16;
  }
  return Math.min(128, Math.max(1, Math.floor(number)));
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

function sendRuntimeGameInput(x, y) {
  setHoverCell(x, y);
  if (!api?.sendGameInput) {
    errorMessage.value = "Game runtime input API is unavailable";
    return;
  }
  api
    .sendGameInput({
      type: "click",
      x,
      y,
    })
    .then((result) => {
      applyState(result?.data ?? result);
    })
    .catch((error) => {
      errorMessage.value = error.message || String(error);
    });
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

function formatRuntimeValue(value, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return String(value);
}
</script>

<template>
  <LedGameTouchView v-if="isTouchWindow" />

  <SecondaryDisplayView v-else-if="isSecondaryWindow" />

  <DemoView
    v-else-if="isDebugWindow"
    :demo-type="demoType"
    :engine-state="engineState"
    :error-message="debugErrorMessage"
    :frame-age="frameAge"
    :frame-size-label="frameSizeLabel"
    :gameplay-summary="gameplaySummary"
    :hover-cell="hoverCell"
    :is-debug-window="isDebugWindow"
    :pixels="frameState.pixels"
    :runtime-status-items="runtimeStatusItems"
    @clear-hover-cell="clearHoverCell"
    @game-input="sendRuntimeGameInput"
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
          type="button"
          :disabled="busyAction === 'game-flow'"
          @click="enterGameFlow"
        >
          {{ busyAction === "game-flow" ? t("nav.entering") : t("nav.enterGame") }}
        </button>
        <button
          class="nav-tab"
          :class="{ active: activeView === 'demo' }"
          type="button"
          @click="activeView = 'demo'"
        >
          {{ t("nav.demo") }}
        </button>
        <button
          class="nav-tab"
          :class="{ active: activeView === 'games' || activeView === 'simple-editor' }"
          type="button"
          @click="activeView = 'games'"
        >
          {{ t("nav.games") }}
        </button>
        <button
          class="nav-tab"
          :class="{ active: activeView === 'media' }"
          type="button"
          @click="activeView = 'media'"
        >
          {{ t("nav.media") }}
        </button>
        <button
          class="nav-tab"
          :class="{ active: activeView === 'spirits' }"
          type="button"
          @click="activeView = 'spirits'"
        >
          {{ t("nav.spirits") }}
        </button>
        <button
          class="nav-tab"
          :class="{ active: activeView === 'language' }"
          type="button"
          @click="activeView = 'language'"
        >
          {{ t("nav.language") }}
        </button>
        <div class="nav-help-wrapper">
          <button
            ref="secondaryButtonRef"
            class="nav-tab nav-help-button"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="secondaryMenuOpen"
            @click="toggleSecondaryMenu"
            @keydown="onSecondaryButtonKeydown"
          >
            {{ t("nav.secondaryDisplay") }}
            <span class="nav-help-chevron" aria-hidden="true">▾</span>
          </button>
          <div
            v-if="secondaryMenuOpen"
            ref="secondaryMenuRef"
            class="nav-help-menu"
            role="menu"
          >
            <button
              class="nav-help-item"
              type="button"
              role="menuitem"
              @click="showSecondaryDisplayList"
            >
              {{ t("nav.secondaryDisplayList") }}
            </button>
            <button
              class="nav-help-item"
              type="button"
              role="menuitem"
              :disabled="
                !secondaryDisplayState.selectedAvailable ||
                busyAction === 'secondary-display'
              "
              @click="openSecondaryDisplay"
            >
              {{
                busyAction === "secondary-display"
                  ? t("secondaryDisplay.opening")
                  : t("nav.openSecondaryDisplay")
              }}
            </button>
          </div>
        </div>
        <button
          class="nav-tab"
          :class="{ active: activeView === 'application-settings' }"
          type="button"
          @click="activeView = 'application-settings'"
        >
          {{ t("nav.configuration") }}
        </button>
        <div class="nav-help-wrapper">
          <button
            ref="helpButtonRef"
            class="nav-tab nav-help-button"
            :class="{ active: activeView === 'debug-assistant' || activeView === 'database-refresh' }"
            type="button"
            :aria-haspopup="'menu'"
            :aria-expanded="helpMenuOpen"
            @click="toggleHelpMenu"
            @keydown="onHelpButtonKeydown"
          >
            {{ t("nav.help") }}
            <span class="nav-help-chevron" aria-hidden="true">▾</span>
          </button>
          <div
            v-if="helpMenuOpen"
            ref="helpMenuRef"
            class="nav-help-menu"
            role="menu"
          >
            <button
              class="nav-help-item"
              type="button"
              role="menuitem"
              :class="{ active: activeView === 'debug-assistant' }"
              @click="selectHelpItem('debug-assistant')"
            >
              {{ t("nav.debugAssistant") }}
            </button>
            <button
              class="nav-help-item"
              type="button"
              role="menuitem"
              :class="{ active: activeView === 'database-refresh' }"
              @click="selectHelpItem('database-refresh')"
            >
              {{ t("nav.dataUpdate") }}
            </button>
          </div>
        </div>
      </nav>
    </header>

    <div v-if="secondaryErrorMessage" class="app-global-error" role="alert">
      <span>{{ secondaryErrorMessage }}</span>
      <button type="button" :aria-label="t('common.close')" @click="secondaryErrorMessage = ''">
        ×
      </button>
    </div>

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

    <GameListView v-else-if="activeView === 'games'" @open-game="openSimpleEditor" />

    <SimpleGameEditorView
      v-else-if="activeView === 'simple-editor'"
      :game-id="selectedEditorGame?.id"
      :game-name="selectedEditorGame?.name"
      @back="backToGameList"
    />

    <MediaLibraryView v-else-if="activeView === 'media'" />

    <SpiritLibraryView v-else-if="activeView === 'spirits'" />

    <Elc408DebugAssistantView v-else-if="activeView === 'debug-assistant'" />

    <DatabaseRefreshView v-else-if="activeView === 'database-refresh'" />

    <ApplicationSettingsView v-else-if="activeView === 'application-settings'" />

    <LanguageView v-else />

    <SecondaryDisplayPickerDialog
      :open="secondaryPickerOpen"
      @close="secondaryPickerOpen = false"
      @state="applySecondaryDisplayState"
    />
  </main>
</template>
