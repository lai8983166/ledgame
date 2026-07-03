<script setup>
import { computed, onMounted, ref, toRaw } from "vue";

defineEmits(["back"]);

const api = window.ledGame;
const busyAction = ref("");
const errorMessage = ref("");
const statusMessage = ref("");
const runtimeStatusMessage = ref("");
const runtimeErrorMessage = ref("");
const runtimeResult = ref(null);
const previewStatusMessage = ref("");
const validationErrors = ref([]);
const document = ref(null);
const activeLevelIndex = ref(0);
const activeFrameIndex = ref(0);
const selectedColor = ref(0);
const matrixZoom = ref(1);
const draggingFrameProgress = ref(false);

const levels = computed(() => document.value?.levels || []);
const activeLevel = computed(() => levels.value[activeLevelIndex.value] || null);
const frames = computed(() => activeLevel.value?.frameList || []);
const activeFrame = computed(() => frames.value[activeFrameIndex.value] || null);
const activeFramePercent = computed(() => {
  if (frames.value.length <= 1) {
    return 0;
  }
  return (activeFrameIndex.value / (frames.value.length - 1)) * 100;
});
const matrixWidth = computed(() => clampDimension(document.value?.siteSizeWidth));
const matrixHeight = computed(() => clampDimension(document.value?.siteSizeHeight));
const matrixCellSize = computed(() => `${Math.round(18 * matrixZoom.value)}px`);
const matrixGapSize = computed(() => `${Math.max(1, Math.round(2 * matrixZoom.value))}px`);
const matrixRows = computed(() =>
  Array.from({ length: matrixHeight.value }, (_value, row) => row),
);
const matrixColumns = computed(() =>
  Array.from({ length: matrixWidth.value }, (_value, column) => column),
);
const colorOptions = computed(() => [
  { index: 0, label: "Color 0", value: normalizeColor(document.value?.color0, "#00ff00") },
  { index: 1, label: "Color 1", value: normalizeColor(document.value?.color1, "#0000ff") },
  { index: 2, label: "Color 2", value: normalizeColor(document.value?.color2, "#ff00ff") },
  { index: 3, label: "Color 3", value: normalizeColor(document.value?.color3, "#ffffff") },
]);
const runtimeSummary = computed(() => formatRuntimeSummary(runtimeResult.value));
const pointMap = computed(() => {
  const map = new Map();
  for (const point of activeFrame.value?.matrix || []) {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (Number.isInteger(x) && Number.isInteger(y) && !map.has(createPointKey(x, y))) {
      map.set(createPointKey(x, y), point);
    }
  }
  return map;
});

onMounted(() => {
  loadEditor();
});

async function loadEditor() {
  await runEditorAction("load", async () => {
    const seeded = await api.seedSimpleDemo();
    const gameId = seeded?.data?.id;
    if (!gameId) {
      throw new Error("simple-demo seed did not return a game id");
    }
    const detail = await api.getGameEditor(gameId);
    document.value = ensureEditableShape(detail?.data);
    activeLevelIndex.value = 0;
    activeFrameIndex.value = 0;
    selectedColor.value = 0;
    statusMessage.value = "simple 已加载";
    runtimeStatusMessage.value = "";
    runtimeErrorMessage.value = "";
    runtimeResult.value = null;
    previewStatusMessage.value = "";
    validationErrors.value = [];
  });
}

async function validateEditor() {
  if (!document.value) {
    return;
  }
  await runEditorAction("validate", async () => {
    const result = await api.validateGameEditor(createEditorPayload());
    validationErrors.value = result?.data?.errors || [];
    statusMessage.value = result?.data?.valid ? "校验通过" : "校验未通过";
  });
}

async function saveEditor() {
  if (!document.value?.id) {
    return;
  }
  await runEditorAction("save", async () => {
    const payload = createEditorPayload();
    const result = await api.saveGameEditor(payload.id, payload);
    statusMessage.value = result?.data?.saved ? "保存成功" : "保存完成";
    validationErrors.value = [];
  });
}

async function startGame() {
  const gameId = document.value?.id;
  if (!gameId || busyAction.value === "start") {
    return;
  }
  busyAction.value = "start";
  runtimeStatusMessage.value = "启动中...";
  runtimeErrorMessage.value = "";
  runtimeResult.value = null;
  try {
    if (!api) {
      throw new Error("Electron API is unavailable");
    }
    const result = await api.startGame(gameId);
    runtimeResult.value = result?.data || result;
    runtimeStatusMessage.value = "启动成功";
    previewStatusMessage.value = "可打开预览窗口观察运行帧";
  } catch (error) {
    runtimeStatusMessage.value = "";
    runtimeErrorMessage.value = error.message || String(error);
  } finally {
    busyAction.value = "";
  }
}

async function stopGame() {
  if (busyAction.value === "stop") {
    return;
  }
  busyAction.value = "stop";
  runtimeStatusMessage.value = "停止中...";
  runtimeErrorMessage.value = "";
  try {
    if (!api?.stopGame) {
      throw new Error("Electron stop API is unavailable");
    }
    const result = await api.stopGame();
    runtimeResult.value = result?.data || result;
    runtimeStatusMessage.value = "已停止";
    previewStatusMessage.value = "可以继续编辑，保存后再次启动";
  } catch (error) {
    runtimeStatusMessage.value = "";
    runtimeErrorMessage.value = error.message || String(error);
  } finally {
    busyAction.value = "";
  }
}

async function openPreview() {
  previewStatusMessage.value = "正在打开预览窗口...";
  runtimeErrorMessage.value = "";
  try {
    if (!api?.openDebugPanel) {
      throw new Error("Electron preview API is unavailable");
    }
    await api.openDebugPanel();
    previewStatusMessage.value = "预览窗口已打开";
  } catch (error) {
    previewStatusMessage.value = "";
    runtimeErrorMessage.value = error.message || String(error);
  }
}

async function runEditorAction(name, action) {
  busyAction.value = name;
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    if (!api) {
      throw new Error("Electron API is unavailable");
    }
    await action();
  } catch (error) {
    errorMessage.value = error.message || String(error);
  } finally {
    busyAction.value = "";
  }
}

function selectLevel(index) {
  activeLevelIndex.value = index;
  activeFrameIndex.value = 0;
  ensureActiveFrame();
}

function selectFrame(index) {
  activeFrameIndex.value = index;
  ensureActiveFrame();
}

function selectFrameFromPointer(event) {
  if (!frames.value.length) {
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const nextIndex = Math.round(ratio * (frames.value.length - 1));
  selectFrame(nextIndex);
}

function startFrameDrag(event) {
  draggingFrameProgress.value = true;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  selectFrameFromPointer(event);
}

function dragFrameProgress(event) {
  if (!draggingFrameProgress.value) {
    return;
  }
  selectFrameFromPointer(event);
}

function stopFrameDrag(event) {
  draggingFrameProgress.value = false;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
}

function addLevel() {
  document.value = ensureEditableShape(document.value);
  const nextIndex = levels.value.length;
  document.value.levels.push({
    label: `Level ${nextIndex + 1}`,
    frameList: [createBlankFrame()],
  });
  activeLevelIndex.value = nextIndex;
  activeFrameIndex.value = 0;
}

function addFrame() {
  const level = activeLevel.value;
  if (!level) {
    return;
  }
  level.frameList ||= [];
  level.frameList.push(createBlankFrame());
  activeFrameIndex.value = level.frameList.length - 1;
}

function selectColor(index) {
  selectedColor.value = index;
}

function paintCell(x, y) {
  const frame = ensureActiveFrame();
  const matrix = frame.matrix;
  const existing = matrix.find((point) => Number(point.x) === x && Number(point.y) === y);
  if (existing) {
    existing.color = selectedColor.value;
    return;
  }
  matrix.push({ x, y, color: selectedColor.value });
}

function zoomMatrix(event) {
  event.preventDefault();
  const direction = event.deltaY > 0 ? -1 : 1;
  matrixZoom.value = clampZoom(matrixZoom.value + direction * 0.1);
}

function getCellColor(x, y) {
  const point = pointMap.value.get(createPointKey(x, y));
  if (!point) {
    return "#26313d";
  }
  const colorIndex = clampColorIndex(point.color);
  return colorOptions.value[colorIndex]?.value || "#26313d";
}

function ensureEditableShape(value) {
  const next = value || {};
  next.levels ||= [];
  if (!next.levels[0]) {
    next.levels[0] = { label: "Level 1", frameList: [] };
  }
  next.levels.forEach((level, index) => {
    level.label ||= `Level ${index + 1}`;
    level.frameList ||= [];
    if (!level.frameList[0]) {
      level.frameList[0] = { repeatTimes: 1, matrix: [] };
    }
    level.frameList.forEach((frame) => {
      frame.repeatTimes ||= 1;
      frame.matrix ||= [];
    });
  });
  return next;
}

function ensureActiveFrame() {
  if (!activeLevel.value) {
    document.value = ensureEditableShape(document.value);
  }
  if (!activeLevel.value.frameList[activeFrameIndex.value]) {
    activeLevel.value.frameList[activeFrameIndex.value] = { repeatTimes: 1, matrix: [] };
  }
  activeLevel.value.frameList[activeFrameIndex.value].matrix ||= [];
  return activeLevel.value.frameList[activeFrameIndex.value];
}

function createBlankFrame() {
  return {
    repeatTimes: 1,
    matrix: [],
  };
}

function createEditorPayload() {
  return JSON.parse(JSON.stringify(toRaw(document.value)));
}

function createPointKey(x, y) {
  return `${x}:${y}`;
}

function normalizeColor(value, fallback) {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }
  return fallback;
}

function clampDimension(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 1;
  }
  return Math.min(96, Math.max(1, Math.floor(number)));
}

function clampColorIndex(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.min(3, Math.max(0, Math.floor(number)));
}

function clampZoom(value) {
  return Math.min(2, Math.max(0.5, Number(value.toFixed(2))));
}

function formatRuntimeSummary(value) {
  if (!value) {
    return [];
  }
  const summary = [];
  const fields = [
    ["状态", value.engineState || value.state],
    ["玩法", value.gameName || value.name],
    ["ID", value.gameId || value.id],
    ["尺寸", value.width && value.height ? `${value.width} x ${value.height}` : ""],
  ];
  for (const [label, fieldValue] of fields) {
    if (fieldValue !== undefined && fieldValue !== null && fieldValue !== "") {
      summary.push(`${label}: ${fieldValue}`);
    }
  }
  if (!summary.length) {
    summary.push(JSON.stringify(value));
  }
  return summary;
}
</script>

<template>
  <section class="workspace simple-editor-workspace">
    <div class="editor-topbar">
      <button class="soft-button" type="button" @click="$emit('back')">返回列表</button>
      <div>
        <h1>simple 编辑器</h1>
        <p>{{ document?.id ? `ID ${document.id}` : "Loading simple-demo" }}</p>
      </div>
      <div class="editor-actions">
        <button
          class="soft-button"
          :disabled="Boolean(busyAction) || !document"
          type="button"
          @click="validateEditor"
        >
          校验
        </button>
        <button
          class="soft-button"
          :disabled="Boolean(busyAction) || !document"
          type="button"
          @click="saveEditor"
        >
          保存
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="error-line">{{ errorMessage }}</p>
    <p v-if="statusMessage" class="status-line">{{ statusMessage }}</p>

    <div v-if="!document && !errorMessage" class="editor-loading">正在读取 simple-demo...</div>

    <div v-if="document" class="simple-editor-layout">
      <aside class="editor-panel editor-left">
        <h2>基础信息</h2>
        <label>
          <span>名称</span>
          <input v-model="document.name" type="text" />
        </label>
        <label>
          <span>描述</span>
          <input v-model="document.description" type="text" />
        </label>
        <label>
          <span>备注</span>
          <input v-model="document.remark" type="text" />
        </label>
        <div class="two-column-fields">
          <label>
            <span>宽度</span>
            <input v-model.number="document.siteSizeWidth" min="1" type="number" />
          </label>
          <label>
            <span>高度</span>
            <input v-model.number="document.siteSizeHeight" min="1" type="number" />
          </label>
        </div>
        <div class="two-column-fields">
          <label>
            <span>周期</span>
            <input v-model.number="document.period" min="1" type="number" />
          </label>
          <label>
            <span>难度</span>
            <input v-model.number="document.difficulty" min="0" type="number" />
          </label>
        </div>
      </aside>

      <main class="editor-panel editor-center">
        <div class="sequence-block">
          <div class="sequence-head">
            <h2>关卡</h2>
            <div class="sequence-head-actions">
              <p>{{ levels.length }} levels</p>
              <button class="icon-add-button" type="button" aria-label="添加关卡" @click="addLevel">
                +
              </button>
            </div>
          </div>
          <div class="sequence-list">
            <button
              v-for="(level, index) in levels"
              :key="`level-${index}`"
              class="sequence-pill"
              :class="{ active: activeLevelIndex === index }"
              type="button"
              @click="selectLevel(index)"
            >
              {{ level.label || `Level ${index + 1}` }}
            </button>
          </div>
        </div>

        <div class="sequence-block">
          <div class="sequence-head">
            <h2>帧</h2>
            <p>{{ frames.length }} frames</p>
          </div>
          <div class="frame-progress-row">
            <div class="frame-progress-shell">
              <div
                class="frame-progress-track"
                @pointerdown="startFrameDrag"
                @pointermove="dragFrameProgress"
                @pointerup="stopFrameDrag"
                @pointercancel="stopFrameDrag"
                @lostpointercapture="draggingFrameProgress = false"
              >
                <div
                  class="frame-progress-fill"
                  :style="{ width: `${activeFramePercent}%` }"
                ></div>
                <div
                  class="frame-progress-marker"
                  :style="{ left: `${activeFramePercent}%` }"
                ></div>
              </div>
              <div class="frame-tick-row">
                <button
                  v-for="(frame, index) in frames"
                  :key="`frame-${index}`"
                  class="frame-tick"
                  :class="{ active: activeFrameIndex === index }"
                  type="button"
                  @click="selectFrame(index)"
                >
                  <span class="frame-tick-dot"></span>
                  <span class="frame-tick-label">{{ index + 1 }}</span>
                </button>
              </div>
            </div>
            <button class="icon-add-button" type="button" aria-label="添加帧" @click="addFrame">
              +
            </button>
          </div>
        </div>

        <div class="frame-settings">
          <label>
            <span>当前关卡名称</span>
            <input v-model="activeLevel.label" type="text" />
          </label>
          <label>
            <span>当前帧重复次数</span>
            <input v-model.number="activeFrame.repeatTimes" min="1" type="number" />
          </label>
        </div>

        <div class="matrix-scroll" @wheel="zoomMatrix">
          <div
            class="editable-matrix"
            :style="{
              gridTemplateColumns: `repeat(${matrixWidth}, ${matrixCellSize})`,
              gridTemplateRows: `repeat(${matrixHeight}, ${matrixCellSize})`,
              gap: matrixGapSize,
            }"
          >
            <template v-for="row in matrixRows" :key="`row-${row}`">
              <button
                v-for="column in matrixColumns"
                :key="`${column}-${row}`"
                class="matrix-cell"
                :style="{ backgroundColor: getCellColor(column, row) }"
                type="button"
                :title="`x ${column}, y ${row}`"
                @click="paintCell(column, row)"
              ></button>
            </template>
          </div>
        </div>
      </main>

      <aside class="editor-panel editor-right">
        <h2>编辑选项</h2>
        <div class="palette-options">
          <button
            v-for="color in colorOptions"
            :key="color.index"
            class="palette-option"
            :class="{ active: selectedColor === color.index }"
            type="button"
            @click="selectColor(color.index)"
          >
            <span class="palette-swatch" :style="{ backgroundColor: color.value }"></span>
            <span>{{ color.label }}</span>
          </button>
        </div>
        <div class="editor-meta">
          <p>当前画笔：Color {{ selectedColor }}</p>
          <p>矩阵：{{ matrixWidth }} x {{ matrixHeight }}</p>
          <p>缩放：{{ Math.round(matrixZoom * 100) }}%</p>
          <p>点位：{{ activeFrame?.matrix?.length || 0 }}</p>
        </div>
        <div class="runtime-panel">
          <button
            class="soft-button runtime-start-button"
            :disabled="Boolean(busyAction) || !document?.id"
            type="button"
            @click="startGame"
          >
            {{ busyAction === "start" ? "启动中" : "启动游戏" }}
          </button>
          <button
            class="soft-button runtime-start-button"
            :disabled="Boolean(busyAction)"
            type="button"
            @click="stopGame"
          >
            {{ busyAction === "stop" ? "停止中" : "停止游戏" }}
          </button>
          <button
            class="soft-button runtime-start-button"
            :disabled="Boolean(busyAction) || !runtimeResult"
            type="button"
            @click="openPreview"
          >
            打开预览
          </button>
          <p v-if="runtimeStatusMessage" class="status-line">{{ runtimeStatusMessage }}</p>
          <p v-if="previewStatusMessage" class="status-line">{{ previewStatusMessage }}</p>
          <p v-if="runtimeErrorMessage" class="error-line">{{ runtimeErrorMessage }}</p>
          <div v-if="runtimeSummary.length" class="runtime-summary">
            <p v-for="line in runtimeSummary" :key="line">{{ line }}</p>
          </div>
        </div>
        <div v-if="validationErrors.length" class="validation-list">
          <p v-for="error in validationErrors" :key="`${error.path}-${error.message}`">
            {{ error.path }}: {{ error.message }}
          </p>
        </div>
      </aside>
    </div>
  </section>
</template>
