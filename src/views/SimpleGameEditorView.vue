<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue";
import SimpleMatrixCanvas from "../components/SimpleMatrixCanvas.vue";

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
const previewFrameIndex = ref(null);
const selectedObjectId = ref("");
const panoramaMode = ref(false);
const selectionMode = ref(false);
const mergeSelectionIds = ref([]);
const anchorEditMode = ref(false);
const anchorCandidate = ref(null);
const objectIdCounter = ref(0);
const contextMenu = ref({ visible: false, x: 0, y: 0 });
const fitViewportRef = ref(null);
const fitContentRef = ref(null);
const editorFitScale = ref(1);
const editorFitBaseWidth = ref(0);
const editorFitBaseHeight = ref(0);
let pendingZoomDirection = 0;
let zoomAnimationFrame = 0;
let fitResizeObserver = null;
let fitMeasureFrame = 0;

const PANORAMA_PADDING = 8;
const MIN_EDITOR_FIT_WIDTH = 1500;
const MIN_EDITOR_FIT_HEIGHT = 860;

// Matrix auto-fit: the matrix canvas is sized from these container measurements so it
// fills the .matrix-scroll column instead of using a fixed 18px cell. matrixZoom remains
// a user multiplier (wheel) on top of the auto-fit base.
const matrixScrollRef = ref(null);
const matrixContainerWidth = ref(0);
const matrixContainerHeight = ref(0);
let matrixResizeObserver = null;
const matrixBasePatchVersion = ref(0);
const matrixBasePatchCells = ref([]);
let matrixFrameCache = new WeakMap();
let frameOccupancyCache = new WeakMap();
let matrixCacheWarmupHandle = 0;
let matrixCacheWarmupHandleType = "";
let matrixCacheWarmupQueue = [];
const matrixCacheRevision = ref(0);
const MIN_MATRIX_CELL = 8;
const MAX_MATRIX_CELL = 64;
const MATRIX_GAP_RATIO = 0.12;
const MATRIX_SCROLL_PADDING = 18;
const MATRIX_CACHE_WARMUP_BATCH_SIZE = 2;

const levels = computed(() => document.value?.levels || []);
const activeLevel = computed(() => levels.value[activeLevelIndex.value] || null);
const frames = computed(() => activeLevel.value?.frameList || []);
const activeFrame = computed(() => frames.value[activeFrameIndex.value] || null);
const displayedFrameIndex = computed(() =>
  draggingFrameProgress.value && previewFrameIndex.value !== null
    ? previewFrameIndex.value
    : activeFrameIndex.value,
);
const previewFrame = computed(() => frames.value[displayedFrameIndex.value] || activeFrame.value || null);
const activeFramePercent = computed(() => {
  if (frames.value.length <= 1) {
    return 0;
  }
  return (displayedFrameIndex.value / (frames.value.length - 1)) * 100;
});
const matrixWidth = computed(() => clampDimension(document.value?.siteSizeWidth));
const matrixHeight = computed(() => clampDimension(document.value?.siteSizeHeight));
const matrixCellSizeValue = computed(() => {
  // Base is the auto-fit cell (fills the .matrix-scroll column); matrixZoom is a user
  // multiplier on top. autoFitMatrixCell is defined further down — the forward reference
  // is fine because computed callbacks evaluate lazily.
  const base = autoFitMatrixCell.value || 18;
  const cell = Math.round(base * matrixZoom.value);
  return Math.min(MAX_MATRIX_CELL, Math.max(MIN_MATRIX_CELL, cell));
});
const matrixGapSizeValue = computed(() =>
  Math.max(1, Math.round(matrixCellSizeValue.value * MATRIX_GAP_RATIO)),
);
const matrixRange = computed(() => {
  const padding = panoramaMode.value ? PANORAMA_PADDING : 0;
  return {
    minX: -padding,
    maxX: matrixWidth.value - 1 + padding,
    minY: -padding,
    maxY: matrixHeight.value - 1 + padding,
  };
});
const matrixRows = computed(() => createRange(matrixRange.value.minY, matrixRange.value.maxY));
const matrixColumns = computed(() => createRange(matrixRange.value.minX, matrixRange.value.maxX));
const matrixRowCount = computed(() => matrixRows.value.length);
const matrixColumnCount = computed(() => matrixColumns.value.length);
const autoFitMatrixCell = computed(() => {
  // Pick the largest square cell that fits the measured .matrix-scroll content area in
  // BOTH dimensions. total = n*cell + (n-1)*gap, gap≈cell*MATRIX_GAP_RATIO
  //   => cell*(n + MATRIX_GAP_RATIO*(n-1)) ≤ avail  =>  cell ≤ avail / (n + MATRIX_GAP_RATIO*(n-1))
  const cols = Math.max(1, matrixColumnCount.value);
  const rows = Math.max(1, matrixRowCount.value);
  const availW = Math.max(0, matrixContainerWidth.value - 2 * MATRIX_SCROLL_PADDING);
  const availH = Math.max(0, matrixContainerHeight.value - 2 * MATRIX_SCROLL_PADDING);
  if (!availW && !availH) {
    return 0; // container not measured yet; matrixCellSizeValue falls back to 18px base
  }
  const cellByW = availW ? availW / (cols + MATRIX_GAP_RATIO * Math.max(0, cols - 1)) : Infinity;
  const cellByH = availH ? availH / (rows + MATRIX_GAP_RATIO * Math.max(0, rows - 1)) : Infinity;
  return Math.floor(Math.min(cellByW, cellByH));
});
const colorOptions = computed(() => [
  { index: 0, label: "Color 0", value: normalizeColor(document.value?.color0, "#00ff00") },
  { index: 1, label: "Color 1", value: normalizeColor(document.value?.color1, "#0000ff") },
  { index: 2, label: "Color 2", value: normalizeColor(document.value?.color2, "#ff00ff") },
  { index: 3, label: "Color 3", value: normalizeColor(document.value?.color3, "#ffffff") },
]);
const matrixCells = computed(() => {
  matrixCacheRevision.value;
  const frame = previewFrame.value;
  return frame ? getOrCreateMatrixCells(frame) : [];
});
const matrixOverlayHighlights = computed(() => {
  const frame = previewFrame.value;
  if (!frame) {
    return [];
  }
  const highlights = [];
  const selected = (frame.matrix || []).find((object) => object.id === selectedObjectId.value);
  if (selected) {
    getObjectCells(selected).forEach((cell) => {
      if (isCellInMatrixRange(cell.x, cell.y)) {
        highlights.push({ x: cell.x, y: cell.y, type: "selected" });
      }
    });
  }
  const mergeIds = mergeSelectionIds.value;
  for (const object of frame.matrix || []) {
    if (!mergeIds.includes(object.id)) {
      continue;
    }
    getObjectCells(object).forEach((cell) => {
      if (isCellInMatrixRange(cell.x, cell.y)) {
        highlights.push({ x: cell.x, y: cell.y, type: "merge" });
      }
    });
  }
  const anchorHighlight = createAnchorHighlight(frame);
  if (anchorHighlight && isCellInMatrixRange(anchorHighlight.x, anchorHighlight.y)) {
    highlights.push(anchorHighlight);
  }
  return highlights;
});
const runtimeSummary = computed(() => formatRuntimeSummary(runtimeResult.value));
const frameObjects = computed(() =>
  (activeFrame.value?.matrix || []).map((object, index) => createObjectSummary(object, index)),
);
const selectedObject = computed(() =>
  (activeFrame.value?.matrix || []).find((object) => object.id === selectedObjectId.value) || null,
);
const selectedObjectIndex = computed(() =>
  (activeFrame.value?.matrix || []).findIndex((object) => object.id === selectedObjectId.value),
);
const selectedObjectCanMoveUp = computed(
  () => selectedObjectIndex.value >= 0 && selectedObjectIndex.value < (activeFrame.value?.matrix || []).length - 1,
);
const selectedObjectCanMoveDown = computed(() => selectedObjectIndex.value > 0);
const occupancyIndex = computed(() =>
  activeFrame.value ? getOrCreateFrameOccupancyIndex(activeFrame.value) : new Map(),
);
const expandedCellMap = computed(() =>
  activeFrame.value ? createExpandedCellMap(activeFrame.value) : new Map(),
);

function createExpandedCellMap(frame) {
  const occupancy = getOrCreateFrameOccupancyIndex(frame);
  const map = new Map();
  for (const [key, occupants] of occupancy.entries()) {
    const topEntry = getTopOccupancyEntry(occupants);
    if (topEntry) {
      map.set(key, { ...topEntry, occupants });
    }
  }
  return map;
}
const panoramaStatusText = computed(
  () =>
    `x ${matrixRange.value.minX}..${matrixRange.value.maxX}, y ${matrixRange.value.minY}..${matrixRange.value.maxY}`,
);
const editorFitShellStyle = computed(() => ({
  width: `${Math.ceil(editorFitBaseWidth.value * editorFitScale.value)}px`,
  height: `${Math.ceil(editorFitBaseHeight.value * editorFitScale.value)}px`,
}));
const editorFitContentStyle = computed(() => ({
  width: `${editorFitBaseWidth.value || MIN_EDITOR_FIT_WIDTH}px`,
  height: `${editorFitBaseHeight.value || MIN_EDITOR_FIT_HEIGHT}px`,
  transform: `scale(${editorFitScale.value})`,
}));

watch(
  [document, matrixWidth, matrixHeight],
  () => {
    // These change the editor's natural size but not the pinned content box,
    // so the ResizeObserver can't catch them; re-fit after the DOM update.
    // Do not include matrixZoom, panoramaMode, activeLevelIndex, or
    // activeFrameIndex here: those are inner editor operations. Re-fitting
    // the whole editor from inner scrollWidth makes the centered fit shell
    // drift horizontally while the user zooms, enters panorama mode, or drags
    // the frame sequence.
    scheduleEditorFitMeasurement();
    scheduleEditorFitMeasurementAfterFrames(1);
    scheduleMatrixCacheWarmup();
  },
  { flush: "post" },
);

watch(
  [matrixRange, colorOptions],
  () => {
    scheduleMatrixCacheWarmup();
  },
  { flush: "post" },
);

watch(
  document,
  () => {
    // .matrix-scroll is behind v-if="document", so it only exists after the editor data
    // loads. Measure it once and start observing once it appears.
    nextTick(() => {
      measureMatrixContainer();
      if (matrixScrollRef.value && matrixResizeObserver) {
        matrixResizeObserver.observe(matrixScrollRef.value);
      }
    });
  },
  { flush: "post" },
);

onMounted(() => {
  applyInitialEditorFit();
  setupEditorFitMeasurement();
  setupMatrixContainerObserver();
  loadEditor();
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("click", closeContextMenu);
  window.addEventListener("resize", scheduleEditorFitMeasurement);

  // Font loads (system fallback in packaged builds) can shift layout metrics
  // after the first measure; re-fit once fonts settle, then a couple of frames
  // later for the cascade. (window.document, not the local `document` ref.)
  const fonts = window.document?.fonts;
  if (fonts && typeof fonts.ready?.then === "function") {
    fonts.ready
      .then(() => {
        scheduleEditorFitMeasurement();
        scheduleEditorFitMeasurementAfterFrames(2);
      })
      .catch(() => {});
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("click", closeContextMenu);
  window.removeEventListener("resize", scheduleEditorFitMeasurement);
  fitResizeObserver?.disconnect();
  fitResizeObserver = null;
  matrixResizeObserver?.disconnect();
  matrixResizeObserver = null;
  cancelEditorFitMeasurement();
  cancelZoomFrame();
  cancelMatrixCacheWarmup();
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
    resetMatrixFrameCache();
    activeLevelIndex.value = 0;
    activeFrameIndex.value = 0;
    selectedColor.value = 0;
    selectedObjectId.value = "";
    stopSelectionMode();
    panoramaMode.value = false;
    statusMessage.value = "simple 已加载";
    runtimeStatusMessage.value = "";
    runtimeErrorMessage.value = "";
    runtimeResult.value = null;
    previewStatusMessage.value = "";
    validationErrors.value = [];
    scheduleMatrixCacheWarmup(0);
    scheduleEditorFitMeasurement();
    nextTick(() => {
      // Let the v-if="document" three-column grid lay out before re-measuring;
      // the ResizeObserver can't catch this growth (content box is pinned).
      scheduleEditorFitMeasurement();
      scheduleEditorFitMeasurementAfterFrames(3);
    });
  });
}

function setupEditorFitMeasurement() {
  if (typeof ResizeObserver === "function") {
    fitResizeObserver = new ResizeObserver(scheduleEditorFitMeasurement);
    nextTick(() => {
      // Only observe the viewport: its border-box changes when the window
      // resizes. The content element is pinned by inline width/height, so
      // observing it never fires on inner growth (the old bug); inner size
      // changes are covered by the watchers instead.
      if (fitViewportRef.value) {
        fitResizeObserver.observe(fitViewportRef.value);
      }
    });
  }
  scheduleEditorFitMeasurement();
}

function scheduleEditorFitMeasurement() {
  if (fitMeasureFrame) {
    return;
  }
  fitMeasureFrame = window.requestAnimationFrame(() => {
    fitMeasureFrame = 0;
    measureEditorFit();
  });
}

function scheduleEditorFitMeasurementAfterFrames(frames = 1) {
  let remaining = Math.max(1, frames);
  const tick = () => {
    remaining -= 1;
    scheduleEditorFitMeasurement();
    if (remaining > 0) {
      window.requestAnimationFrame(tick);
    }
  };
  window.requestAnimationFrame(tick);
}

function measureEditorFit() {
  const viewport = fitViewportRef.value;
  const content = fitContentRef.value;
  if (!viewport || !content) {
    // Still mounting / swapping views; retry on the next frame instead of
    // leaving editorFitScale stuck at its initial value of 1.
    scheduleEditorFitMeasurement();
    return;
  }
  const viewportWidth = Math.floor(viewport.clientWidth);
  const viewportHeight = Math.floor(viewport.clientHeight);
  if (!viewportWidth || !viewportHeight) {
    scheduleEditorFitMeasurement();
    return;
  }
  const baseWidth = Math.max(viewportWidth, content.scrollWidth, MIN_EDITOR_FIT_WIDTH);
  const baseHeight = Math.max(viewportHeight, content.scrollHeight, MIN_EDITOR_FIT_HEIGHT);
  editorFitBaseWidth.value = baseWidth;
  editorFitBaseHeight.value = baseHeight;
  editorFitScale.value = Number(Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight, 1).toFixed(4));
}

function applyInitialEditorFit() {
  // Synchronous pre-paint fit from window dimensions so the very first frame
  // is already scaled instead of 1500x860 at scale 1 (which gets clipped by
  // the viewport's overflow:hidden). Seed baseWidth/Height with the design
  // size too, so the fit-shell sizes correctly and centers the content
  // (leaving them at 0 would collapse the shell to 0x0 and mis-anchor it).
  // measureEditorFit() will refine these from the real DOM on the next frame.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!vw || !vh) {
    return false;
  }
  const approxViewportWidth = Math.max(0, vw - 84);
  const approxViewportHeight = Math.max(0, vh - 120);
  editorFitBaseWidth.value = MIN_EDITOR_FIT_WIDTH;
  editorFitBaseHeight.value = MIN_EDITOR_FIT_HEIGHT;
  editorFitScale.value = Number(
    Math.min(
      approxViewportWidth / MIN_EDITOR_FIT_WIDTH,
      approxViewportHeight / MIN_EDITOR_FIT_HEIGHT,
      1,
    ).toFixed(4),
  );
  return true;
}

function cancelEditorFitMeasurement() {
  if (!fitMeasureFrame) {
    return;
  }
  window.cancelAnimationFrame(fitMeasureFrame);
  fitMeasureFrame = 0;
}

function measureMatrixContainer() {
  const el = matrixScrollRef.value;
  if (!el) {
    return;
  }
  // clientWidth/Height are layout pixels, unaffected by the workspace's transform:scale,
  // so this reports the real ~650px column / 1fr-row height the matrix should fill.
  matrixContainerWidth.value = el.clientWidth;
  matrixContainerHeight.value = el.clientHeight;
}

function setupMatrixContainerObserver() {
  if (typeof ResizeObserver !== "function") {
    return;
  }
  matrixResizeObserver = new ResizeObserver(measureMatrixContainer);
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
  runtimeStatusMessage.value = "保存并启动中...";
  runtimeErrorMessage.value = "";
  runtimeResult.value = null;
  try {
    if (!api) {
      throw new Error("Electron API is unavailable");
    }
    const payload = createEditorPayload();
    await api.saveGameEditor(payload.id, payload);
    statusMessage.value = "已保存当前编辑器内容";
    validationErrors.value = [];
    const result = await api.startGame({
      id: gameId,
      startLevelIndex: 0,
      launchMethod: "editor",
    });
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

function getCachedMatrixCells(frame) {
  const cacheKey = createMatrixFrameCacheKey(frame);
  const cached = matrixFrameCache.get(frame);
  return cached?.key === cacheKey ? cached.cells : null;
}

function getOrCreateMatrixCells(frame) {
  const cached = getCachedMatrixCells(frame);
  if (cached) {
    return cached;
  }
  const cells = buildMatrixCellsForFrame(frame);
  setCachedMatrixCells(frame, cells);
  return cells;
}

function getOrCreateFrameOccupancyIndex(frame) {
  const cacheKey = getMatrixFrameVersion(frame);
  const cached = frameOccupancyCache.get(frame);
  if (cached?.key === cacheKey) {
    return cached.index;
  }
  const index = createOccupancyIndex(frame.matrix || []);
  frameOccupancyCache.set(frame, {
    key: cacheKey,
    index,
  });
  return index;
}

function buildMatrixCellsForFrame(frame) {
  const cells = [];
  const expandedMap = createExpandedCellMap(frame);
  for (const row of matrixRows.value) {
    for (const column of matrixColumns.value) {
      const cell = expandedMap.get(createPointKey(column, row));
      const occupants = cell?.occupants || [];
      const objectId = cell?.object?.id || "";
      const realCell = isRealCell(column, row);
      const colorIndex = clampColorIndex(cell?.object?.color);
      const color = cell?.object
        ? colorOptions.value[colorIndex]?.value || "#26313d"
        : realCell
          ? "#303b49"
          : "#101821";
      const overlapCount = occupants.length;
      cells.push({
        key: `${column}:${row}`,
        x: column,
        y: row,
        color,
        title: createCellTitle(column, row, occupants),
        overlapCount,
        classes: {
          "real-cell": realCell,
          "virtual-cell": !realCell,
          "object-cell": Boolean(cell),
          "overlap-cell": overlapCount > 1,
        },
        memo: `${objectId}:${color}:${realCell ? 1 : 0}:${overlapCount}`,
      });
    }
  }
  return cells;
}

function setCachedMatrixCells(frame, cells) {
  matrixFrameCache.set(frame, {
    key: createMatrixFrameCacheKey(frame),
    cells,
  });
}

function createMatrixFrameCacheKey(frame) {
  const range = matrixRange.value;
  return [
    getMatrixFrameVersion(frame),
    range.minX,
    range.maxX,
    range.minY,
    range.maxY,
    matrixWidth.value,
    matrixHeight.value,
    colorOptions.value.map((color) => color.value).join("|"),
  ].join(";");
}

function invalidateMatrixFrame(frame = activeFrame.value) {
  if (!frame) {
    return;
  }
  setMatrixFrameVersion(frame, getMatrixFrameVersion(frame) + 1);
  matrixFrameCache.delete(frame);
  frameOccupancyCache.delete(frame);
  matrixCacheRevision.value += 1;
  scheduleMatrixCacheWarmup();
}

function resetMatrixFrameCache() {
  matrixFrameCache = new WeakMap();
  frameOccupancyCache = new WeakMap();
  matrixCacheRevision.value += 1;
  scheduleMatrixCacheWarmup();
}

function scheduleMatrixCacheWarmup(centerIndex = displayedFrameIndex.value) {
  matrixCacheWarmupQueue = createMatrixCacheWarmupQueue(centerIndex);
  if (matrixCacheWarmupHandle || !matrixCacheWarmupQueue.length) {
    return;
  }
  requestMatrixCacheWarmup();
}

function createMatrixCacheWarmupQueue(centerIndex) {
  const frameList = frames.value;
  if (!frameList.length) {
    return [];
  }
  const boundedCenter = Math.min(frameList.length - 1, Math.max(0, toInteger(centerIndex, activeFrameIndex.value)));
  const ordered = [frameList[boundedCenter]];
  for (let distance = 1; ordered.length < frameList.length; distance += 1) {
    const nextIndex = boundedCenter + distance;
    const previousIndex = boundedCenter - distance;
    if (nextIndex < frameList.length) {
      ordered.push(frameList[nextIndex]);
    }
    if (previousIndex >= 0) {
      ordered.push(frameList[previousIndex]);
    }
  }
  return ordered.filter(Boolean);
}

function requestMatrixCacheWarmup() {
  if (typeof window.requestIdleCallback === "function") {
    matrixCacheWarmupHandleType = "idle";
    matrixCacheWarmupHandle = window.requestIdleCallback(runMatrixCacheWarmup, { timeout: 350 });
    return;
  }
  matrixCacheWarmupHandleType = "frame";
  matrixCacheWarmupHandle = window.requestAnimationFrame(() => {
    runMatrixCacheWarmup({
      didTimeout: true,
      timeRemaining: () => 4,
    });
  });
}

function runMatrixCacheWarmup(deadline) {
  matrixCacheWarmupHandle = 0;
  matrixCacheWarmupHandleType = "";
  let warmedCount = 0;
  while (matrixCacheWarmupQueue.length) {
    const hasTime =
      deadline?.didTimeout ||
      typeof deadline?.timeRemaining !== "function" ||
      deadline.timeRemaining() > 2 ||
      warmedCount === 0;
    if (!hasTime || warmedCount >= MATRIX_CACHE_WARMUP_BATCH_SIZE) {
      break;
    }
    const frame = matrixCacheWarmupQueue.shift();
    if (!frame || getCachedMatrixCells(frame)) {
      continue;
    }
    getOrCreateMatrixCells(frame);
    warmedCount += 1;
  }
  if (matrixCacheWarmupQueue.length) {
    requestMatrixCacheWarmup();
  }
}

function cancelMatrixCacheWarmup() {
  if (!matrixCacheWarmupHandle) {
    return;
  }
  if (matrixCacheWarmupHandleType === "idle" && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(matrixCacheWarmupHandle);
  } else {
    window.cancelAnimationFrame(matrixCacheWarmupHandle);
  }
  matrixCacheWarmupHandle = 0;
  matrixCacheWarmupHandleType = "";
  matrixCacheWarmupQueue = [];
}

function getMatrixFrameVersion(frame) {
  return Number(frame?.__matrixVersion) || 0;
}

function setMatrixFrameVersion(frame, version) {
  Object.defineProperty(frame, "__matrixVersion", {
    value: version,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

function selectLevel(index) {
  activeLevelIndex.value = index;
  activeFrameIndex.value = 0;
  ensureActiveFrame();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(0);
}

function selectFrame(index) {
  previewFrameIndex.value = null;
  draggingFrameProgress.value = false;
  activeFrameIndex.value = index;
  ensureActiveFrame();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(index);
}

function getFrameIndexFromPointer(event) {
  if (!frames.value.length) {
    return activeFrameIndex.value;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  return Math.round(ratio * (frames.value.length - 1));
}

function previewFrameFromPointer(event) {
  previewFrameIndex.value = getFrameIndexFromPointer(event);
}

function startFrameDrag(event) {
  draggingFrameProgress.value = true;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  previewFrameFromPointer(event);
}

function dragFrameProgress(event) {
  if (!draggingFrameProgress.value) {
    return;
  }
  previewFrameFromPointer(event);
}

function stopFrameDrag(event) {
  if (!draggingFrameProgress.value) {
    return;
  }
  const nextIndex = previewFrameIndex.value;
  draggingFrameProgress.value = false;
  previewFrameIndex.value = null;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  if (event.type !== "pointercancel" && Number.isInteger(nextIndex)) {
    selectFrame(nextIndex);
  }
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
  syncSelectedObject();
  scheduleMatrixCacheWarmup(0);
}

function addFrame() {
  const level = activeLevel.value;
  if (!level) {
    return;
  }
  level.frameList ||= [];
  level.frameList.push(createBlankFrame());
  invalidateMatrixFrame(level.frameList[level.frameList.length - 1]);
  activeFrameIndex.value = level.frameList.length - 1;
  syncSelectedObject();
  scheduleMatrixCacheWarmup(activeFrameIndex.value);
}

function deleteCurrentFrame() {
  const level = activeLevel.value;
  if (!level?.frameList?.length) {
    return;
  }
  level.frameList.splice(activeFrameIndex.value, 1);
  resetMatrixFrameCache();
  if (!level.frameList.length) {
    level.frameList.push(createBlankFrame());
  }
  activeFrameIndex.value = Math.min(activeFrameIndex.value, level.frameList.length - 1);
  syncSelectedObject();
  scheduleMatrixCacheWarmup(activeFrameIndex.value);
}

function deleteAllFrames() {
  const level = activeLevel.value;
  if (!level) {
    return;
  }
  level.frameList = [createBlankFrame()];
  resetMatrixFrameCache();
  activeFrameIndex.value = 0;
  syncSelectedObject();
  scheduleMatrixCacheWarmup(0);
}

function applyCurrentRepeatTimesToAllFrames() {
  const level = activeLevel.value;
  const frame = activeFrame.value;
  if (!level?.frameList?.length || !frame) {
    return;
  }
  const repeatTimes = Math.max(1, toInteger(frame.repeatTimes, 1));
  level.frameList.forEach((item) => {
    item.repeatTimes = repeatTimes;
  });
  frame.repeatTimes = repeatTimes;
  statusMessage.value = `当前关卡所有帧重复次数已设为 ${repeatTimes}`;
}

function selectColor(index) {
  selectedColor.value = index;
}

function handleCellClick(x, y) {
  const frame = ensureActiveFrame();
  const existing = expandedCellMap.value.get(createPointKey(x, y));
  if (anchorEditMode.value) {
    selectAnchorCandidate(existing);
    return;
  }
  if (selectionMode.value) {
    toggleMergeSelection(existing);
    return;
  }
  const topObject = getTopOccupancyEntry(existing?.occupants)?.object;
  if (topObject?.id) {
    selectObject(topObject.id);
    statusMessage.value = "已选中对象";
    return;
  }
  const object = createMatrixObject(x, y, selectedColor.value, frame);
  frame.matrix.push(object);
  invalidateMatrixFrame(frame);
  selectedObjectId.value = object.id;
  queueMatrixBasePatch(getObjectCells(object));
  statusMessage.value = isRealCell(x, y) ? "已创建单格对象" : "已创建虚拟单格对象";
}

function handleCellRangeCreate(payload) {
  if (anchorEditMode.value || selectionMode.value) {
    return;
  }
  const frame = ensureActiveFrame();
  const cells = dedupeCells(payload?.cells || []);
  if (!cells.length) {
    return;
  }
  const hasOverlap = cells.some((cell) => expandedCellMap.value.has(createPointKey(cell.x, cell.y)));
  const anchorX = toInteger(payload?.anchorX, cells[0].x);
  const anchorY = toInteger(payload?.anchorY, cells[0].y);
  const object = {
    id: createUniqueObjectId(frame, activeFrameIndex.value),
    x: anchorX,
    y: anchorY,
    color: clampColorIndex(selectedColor.value),
    points: cells.map((cell) => [cell.x - anchorX, cell.y - anchorY]),
  };
  frame.matrix.push(object);
  invalidateMatrixFrame(frame);
  selectedObjectId.value = object.id;
  queueMatrixBasePatch(getObjectCells(object));
  statusMessage.value = hasOverlap ? "已创建重叠多格对象" : "已创建多格对象";
}

function queueMatrixBasePatch(cells) {
  matrixBasePatchCells.value = expandPatchCells(cells);
  matrixBasePatchVersion.value += 1;
}

function expandPatchCells(cells) {
  const expanded = [];
  for (const cell of dedupeCells(cells)) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        expanded.push({ x: cell.x + dx, y: cell.y + dy });
      }
    }
  }
  return dedupeCells(expanded);
}

function zoomMatrix(event) {
  event.preventDefault();
  pendingZoomDirection += event.deltaY > 0 ? -1 : 1;
  if (zoomAnimationFrame) {
    return;
  }
  zoomAnimationFrame = window.requestAnimationFrame(() => {
    const direction = Math.sign(pendingZoomDirection);
    pendingZoomDirection = 0;
    zoomAnimationFrame = 0;
    if (direction) {
      matrixZoom.value = clampZoom(matrixZoom.value + direction * 0.1);
    }
  });
}

function selectObject(id) {
  selectedObjectId.value = id;
  stopSelectionMode();
  stopAnchorEdit();
}

function applyBrushColorToSelectedObject() {
  if (!selectedObject.value) {
    return;
  }
  selectedObject.value.color = selectedColor.value;
  invalidateMatrixFrame();
}

function deleteSelectedObject() {
  const frame = ensureActiveFrame();
  const index = frame.matrix.findIndex((object) => object.id === selectedObjectId.value);
  if (index < 0) {
    return;
  }
  frame.matrix.splice(index, 1);
  invalidateMatrixFrame(frame);
  selectedObjectId.value = "";
  stopSelectionMode();
  stopAnchorEdit();
}

function moveSelectedObjectLayerUp() {
  reorderSelectedObject(selectedObjectIndex.value + 1);
}

function moveSelectedObjectLayerDown() {
  reorderSelectedObject(selectedObjectIndex.value - 1);
}

function reorderSelectedObject(targetIndex) {
  const frame = ensureActiveFrame();
  const currentIndex = frame.matrix.findIndex((object) => object.id === selectedObjectId.value);
  if (currentIndex < 0) {
    return;
  }
  const boundedIndex = Math.min(frame.matrix.length - 1, Math.max(0, targetIndex));
  if (boundedIndex === currentIndex) {
    return;
  }
  const [object] = frame.matrix.splice(currentIndex, 1);
  frame.matrix.splice(boundedIndex, 0, object);
  invalidateMatrixFrame(frame);
  statusMessage.value = "对象层级已调整";
}

function applySelectedObjectLayerToAllFrames() {
  const level = activeLevel.value;
  const objectId = selectedObjectId.value;
  const targetIndex = selectedObjectIndex.value;
  if (!level || !objectId || targetIndex < 0) {
    return;
  }

  let appliedCount = 0;
  let skippedCount = 0;
  for (const frame of level.frameList || []) {
    frame.matrix ||= [];
    const currentIndex = frame.matrix.findIndex((object) => object.id === objectId);
    if (currentIndex < 0) {
      skippedCount++;
      continue;
    }

    const [object] = frame.matrix.splice(currentIndex, 1);
    const boundedIndex = Math.min(targetIndex, frame.matrix.length);
    frame.matrix.splice(boundedIndex, 0, object);
    invalidateMatrixFrame(frame);
    appliedCount++;
  }

  statusMessage.value = `对象层级已应用到 ${appliedCount} 帧，跳过 ${skippedCount} 帧`;
}

function copySelectedObjectToPreviousFrame() {
  copySelectedObjectToFrame(activeFrameIndex.value - 1);
}

function copySelectedObjectToNextFrame() {
  copySelectedObjectToFrame(activeFrameIndex.value + 1);
}

function copySelectedObjectToAllFrames() {
  if (!selectedObject.value) {
    return;
  }
  let copied = 0;
  frames.value.forEach((frame, frameIndex) => {
    if (frameIndex === activeFrameIndex.value) {
      return;
    }
    upsertObjectInFrame(selectedObject.value, frame);
    invalidateMatrixFrame(frame);
    copied += 1;
  });
  statusMessage.value = copied ? `已更新 ${copied} 帧` : "没有可复制的目标帧";
}

function copySelectedObjectToFrame(frameIndex) {
  if (!selectedObject.value || frameIndex < 0 || frameIndex >= frames.value.length) {
    return;
  }
  upsertObjectInFrame(selectedObject.value, frames.value[frameIndex]);
  invalidateMatrixFrame(frames.value[frameIndex]);
  statusMessage.value = `已更新第 ${frameIndex + 1} 帧`;
}

function upsertObjectInFrame(object, frame) {
  frame.matrix ||= [];
  const clone = {
    x: toInteger(object.x, 0),
    y: toInteger(object.y, 0),
    id: object.id,
    color: clampColorIndex(object.color),
    points: getObjectPoints(object).map(([dx, dy]) => [dx, dy]),
  };
  const existingIndex = frame.matrix.findIndex((item) => item.id === object.id);
  if (existingIndex >= 0) {
    frame.matrix.splice(existingIndex, 1, clone);
    return;
  }
  frame.matrix.push(clone);
}

function copyCurrentFrameToPreviousFrame() {
  copyCurrentFrameToFrame(activeFrameIndex.value - 1);
}

function copyCurrentFrameToNextFrame() {
  copyCurrentFrameToFrame(activeFrameIndex.value + 1);
}

function copyCurrentFrameToAllFrames() {
  const sourceFrame = ensureActiveFrame();
  let copied = 0;
  frames.value.forEach((frame, frameIndex) => {
    if (frameIndex === activeFrameIndex.value) {
      return;
    }
    replaceFrameObjects(sourceFrame, frame);
    invalidateMatrixFrame(frame);
    copied += 1;
  });
  statusMessage.value = copied ? `当前帧已复制到 ${copied} 帧` : "没有可复制的目标帧";
}

function copyCurrentFrameToFrame(frameIndex) {
  if (frameIndex < 0 || frameIndex >= frames.value.length) {
    return;
  }
  replaceFrameObjects(ensureActiveFrame(), frames.value[frameIndex]);
  invalidateMatrixFrame(frames.value[frameIndex]);
  statusMessage.value = `当前帧已复制到第 ${frameIndex + 1} 帧`;
}

function replaceFrameObjects(sourceFrame, targetFrame) {
  targetFrame.matrix = (sourceFrame.matrix || []).map((object) => ({
    x: toInteger(object.x, 0),
    y: toInteger(object.y, 0),
    id: object.id,
    color: clampColorIndex(object.color),
    points: getObjectPoints(object).map(([dx, dy]) => [dx, dy]),
  }));
}

function startAnchorEdit() {
  if (!selectedObject.value) {
    return;
  }
  stopSelectionMode();
  anchorEditMode.value = true;
  anchorCandidate.value = {
    objectId: selectedObject.value.id,
    x: toInteger(selectedObject.value.x, 0),
    y: toInteger(selectedObject.value.y, 0),
  };
}

function selectAnchorCandidate(cell) {
  const selectedEntry = cell?.occupants?.find((entry) => entry.object?.id === selectedObjectId.value);
  if (!selectedEntry) {
    return;
  }
  anchorCandidate.value = {
    objectId: selectedEntry.object.id,
    x: cell.x,
    y: cell.y,
  };
}

function confirmAnchorEdit() {
  if (!selectedObject.value || !anchorCandidate.value) {
    stopAnchorEdit();
    return;
  }
  const cells = getObjectCells(selectedObject.value);
  const nextX = anchorCandidate.value.x;
  const nextY = anchorCandidate.value.y;
  selectedObject.value.x = nextX;
  selectedObject.value.y = nextY;
  selectedObject.value.points = prioritizeAnchorPoint(
    cells.map((cell) => [cell.x - nextX, cell.y - nextY]),
  );
  invalidateMatrixFrame();
  stopAnchorEdit();
}

function stopAnchorEdit() {
  anchorEditMode.value = false;
  anchorCandidate.value = null;
}

function rotateSelectedObjectClockwise() {
  rotateSelectedObject("clockwise");
}

function rotateSelectedObjectCounterClockwise() {
  rotateSelectedObject("counterclockwise");
}

function rotateSelectedObject(direction) {
  if (!selectedObject.value) {
    return;
  }
  selectedObject.value.points = rotatePointsAroundAnchor(
    getObjectPoints(selectedObject.value),
    direction,
  );
  invalidateMatrixFrame();
}

function moveSelectedObject(deltaX, deltaY) {
  if (!selectedObject.value) {
    return;
  }
  const previousX = toInteger(selectedObject.value.x, 0);
  const previousY = toInteger(selectedObject.value.y, 0);
  selectedObject.value.x = Number(selectedObject.value.x || 0) + deltaX;
  selectedObject.value.y = Number(selectedObject.value.y || 0) + deltaY;
  wrapSelectedObjectInPanorama();
  invalidateMatrixFrame();
  if (anchorCandidate.value?.objectId === selectedObject.value.id) {
    anchorCandidate.value = {
      ...anchorCandidate.value,
      x: anchorCandidate.value.x + toInteger(selectedObject.value.x, 0) - previousX,
      y: anchorCandidate.value.y + toInteger(selectedObject.value.y, 0) - previousY,
    };
  }
}

function togglePanoramaMode() {
  panoramaMode.value = !panoramaMode.value;
  if (!panoramaMode.value) {
    stopSelectionMode();
    stopAnchorEdit();
  }
}

function enterSelectionMode() {
  if (!panoramaMode.value) {
    panoramaMode.value = true;
  }
  stopAnchorEdit();
  selectionMode.value = true;
  selectedObjectId.value = "";
  mergeSelectionIds.value = [];
  closeContextMenu();
}

function stopSelectionMode() {
  selectionMode.value = false;
  mergeSelectionIds.value = [];
  closeContextMenu();
}

function toggleMergeSelection(cell) {
  const object = getTopOccupancyEntry(cell?.occupants)?.object;
  if (!object) {
    return;
  }
  if (!isSingleCellObject(object)) {
    statusMessage.value = "只能合并单格对象";
    return;
  }
  const id = object.id;
  if (mergeSelectionIds.value.includes(id)) {
    mergeSelectionIds.value = mergeSelectionIds.value.filter((item) => item !== id);
    return;
  }
  mergeSelectionIds.value = [...mergeSelectionIds.value, id];
}

function mergeSelectedObjects() {
  const frame = ensureActiveFrame();
  const selectedObjects = mergeSelectionIds.value
    .map((id) => frame.matrix.find((object) => object.id === id))
    .filter(Boolean);
  const mergeableObjects = selectedObjects.filter(isSingleCellObject);
  if (mergeableObjects.length !== selectedObjects.length) {
    statusMessage.value = "已跳过不可合并的多格对象";
  }
  if (mergeableObjects.length < 2) {
    statusMessage.value = "至少选择两个单格对象才能合并";
    return;
  }
  const anchorCell = getObjectCells(mergeableObjects[0])[0];
  const nextObject = {
    id: createUniqueObjectId(frame, activeFrameIndex.value),
    x: anchorCell.x,
    y: anchorCell.y,
    color: clampColorIndex(mergeableObjects[0].color),
    points: mergeableObjects.map((object) => {
      const cell = getObjectCells(object)[0];
      return [cell.x - anchorCell.x, cell.y - anchorCell.y];
    }),
  };
  const removeIds = new Set(mergeableObjects.map((object) => object.id));
  frame.matrix = frame.matrix.filter((object) => !removeIds.has(object.id));
  frame.matrix.push(nextObject);
  invalidateMatrixFrame(frame);
  selectedObjectId.value = nextObject.id;
  stopSelectionMode();
  statusMessage.value = "合并完成";
}

function openContextMenu(event) {
  if (!panoramaMode.value) {
    return;
  }
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
  };
}

function closeContextMenu() {
  if (contextMenu.value.visible) {
    contextMenu.value = { ...contextMenu.value, visible: false };
  }
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
    level.frameList.forEach((frame, frameIndex) => {
      frame.repeatTimes ||= 1;
      frame.matrix ||= [];
      frame.matrix = frame.matrix.map((object) => normalizeMatrixObject(object, frame, frameIndex));
      setMatrixFrameVersion(frame, getMatrixFrameVersion(frame));
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
  activeLevel.value.frameList[activeFrameIndex.value].matrix =
    activeLevel.value.frameList[activeFrameIndex.value].matrix.map((object) =>
      normalizeMatrixObject(object, activeLevel.value.frameList[activeFrameIndex.value], activeFrameIndex.value),
    );
  return activeLevel.value.frameList[activeFrameIndex.value];
}

function createBlankFrame() {
  return {
    repeatTimes: 1,
    matrix: [],
  };
}

function createEditorPayload() {
  const payload = JSON.parse(JSON.stringify(toRaw(document.value)));
  payload.levels?.forEach((level) => {
    level.frameList?.forEach((frame) => {
      frame.matrix = (frame.matrix || [])
        .filter((object) => isObjectInsideRealMatrix(object))
        .map((object) => ({
          x: Number(object.x || 0),
          y: Number(object.y || 0),
          id: object.id,
          color: clampColorIndex(object.color),
          points: getObjectPoints(object),
        }));
      delete frame.__matrixVersion;
    });
  });
  return payload;
}

function createOccupancyIndex(objects) {
  const index = new Map();
  objects.forEach((object, objectIndex) => {
    getObjectCells(object).forEach((cell, pointIndex) => {
      const key = createPointKey(cell.x, cell.y);
      const occupants = index.get(key) || [];
      occupants.push({
        ...cell,
        object,
        objectIndex,
        pointIndex,
      });
      index.set(key, occupants);
    });
  });
  return index;
}

function getTopOccupancyEntry(occupants) {
  if (!Array.isArray(occupants) || !occupants.length) {
    return null;
  }
  return occupants[occupants.length - 1];
}

function createCellTitle(x, y, occupants) {
  if (!occupants?.length) {
    return `x ${x}, y ${y}`;
  }
  const topObjectId = getTopOccupancyEntry(occupants)?.object?.id || "";
  const overlapText = occupants.length > 1 ? `, 重叠 ${occupants.length} 层` : "";
  return `x ${x}, y ${y}, ${topObjectId}${overlapText}`;
}

function createPointKey(x, y) {
  return `${x}:${y}`;
}

function dedupeCells(cells) {
  const map = new Map();
  for (const cell of cells) {
    const x = toInteger(cell?.x, 0);
    const y = toInteger(cell?.y, 0);
    map.set(createPointKey(x, y), { x, y });
  }
  return [...map.values()];
}

function createRange(start, end) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_value, index) => start + index);
}

function createMatrixObject(x, y, color, frame) {
  return {
    id: createUniqueObjectId(frame, activeFrameIndex.value),
    x,
    y,
    color: clampColorIndex(color),
    points: [[0, 0]],
  };
}

function createUniqueObjectId(frame, frameIndex) {
  const usedIds = new Set((frame?.matrix || []).map((object) => object?.id).filter(Boolean));
  let id = "";
  do {
    id = `obj-${frameIndex}-${Date.now().toString(36)}-${(objectIdCounter.value++).toString(36)}`;
  } while (usedIds.has(id));
  return id;
}

function normalizeMatrixObject(value, frame, frameIndex) {
  const object = Array.isArray(value)
    ? createObjectFromTuple(value)
    : { ...value };
  object.x = toInteger(object.x, 0);
  object.y = toInteger(object.y, 0);
  object.color = clampColorIndex(object.color);
  object.points = getObjectPoints(object);
  if (!object.id) {
    object.id = createUniqueObjectId(frame, frameIndex);
  }
  return object;
}

function createObjectFromTuple(value) {
  if (value.length >= 4) {
    return {
      x: value[0],
      y: value[1],
      id: value[2],
      color: value[3]?.color,
      points: value[3]?.points,
    };
  }
  return {
    x: value[0],
    y: value[1],
    color: value[2],
    points: [[0, 0]],
  };
}

function getObjectPoints(object) {
  if (!Array.isArray(object?.points) || !object.points.length) {
    return [[0, 0]];
  }
  const points = object.points
    .map((point) => {
      if (Array.isArray(point)) {
        return [toInteger(point[0], 0), toInteger(point[1], 0)];
      }
      return [toInteger(point?.x, 0), toInteger(point?.y, 0)];
    })
    .filter(([dx, dy]) => Number.isInteger(dx) && Number.isInteger(dy));
  return points.length ? points : [[0, 0]];
}

function getObjectCells(object) {
  const baseX = toInteger(object?.x, 0);
  const baseY = toInteger(object?.y, 0);
  return getObjectPoints(object).map(([dx, dy]) => ({
    x: baseX + dx,
    y: baseY + dy,
    dx,
    dy,
  }));
}

function createObjectSummary(object, index) {
  const points = getObjectPoints(object);
  return {
    index,
    id: object.id,
    x: toInteger(object.x, 0),
    y: toInteger(object.y, 0),
    color: clampColorIndex(object.color),
    occupiedCount: points.length,
    object,
  };
}

function rotatePointsAroundAnchor(points, direction) {
  if (direction === "clockwise") {
    return points.map(([dx, dy]) => [-dy, dx]);
  }
  return points.map(([dx, dy]) => [dy, -dx]);
}

function isSingleCellObject(object) {
  return getObjectPoints(object).length === 1;
}

function isRealCell(x, y) {
  return x >= 0 && x < matrixWidth.value && y >= 0 && y < matrixHeight.value;
}

function isObjectInsideRealMatrix(object) {
  return getObjectCells(object).every((cell) => isRealCell(cell.x, cell.y));
}

function isCellInMatrixRange(x, y) {
  const range = matrixRange.value;
  return x >= range.minX && x <= range.maxX && y >= range.minY && y <= range.maxY;
}

function createAnchorHighlight(frame) {
  const selected = (frame.matrix || []).find((object) => object.id === selectedObjectId.value);
  if (anchorEditMode.value && selected) {
    const anchor = anchorCandidate.value || selected;
    return {
      x: toInteger(anchor.x, 0),
      y: toInteger(anchor.y, 0),
      type: "anchor",
    };
  }
  const mergeAnchorId = mergeSelectionIds.value[0];
  if (!mergeAnchorId) {
    return null;
  }
  const anchorObject = (frame.matrix || []).find((object) => object.id === mergeAnchorId);
  if (!anchorObject) {
    return null;
  }
  const anchorCell = getObjectCells(anchorObject)[0];
  return anchorCell ? { x: anchorCell.x, y: anchorCell.y, type: "anchor" } : null;
}

function prioritizeAnchorPoint(points) {
  return [...points].sort((first, second) => {
    const firstIsAnchor = first[0] === 0 && first[1] === 0;
    const secondIsAnchor = second[0] === 0 && second[1] === 0;
    if (firstIsAnchor === secondIsAnchor) {
      return 0;
    }
    return firstIsAnchor ? -1 : 1;
  });
}

function wrapSelectedObjectInPanorama() {
  if (!panoramaMode.value || !selectedObject.value) {
    return;
  }
  const range = matrixRange.value;
  const width = range.maxX - range.minX + 1;
  const height = range.maxY - range.minY + 1;
  let cells = getObjectCells(selectedObject.value);
  if (cells.some((cell) => cell.x < range.minX)) {
    selectedObject.value.x = toInteger(selectedObject.value.x, 0) + width;
  } else if (cells.some((cell) => cell.x > range.maxX)) {
    selectedObject.value.x = toInteger(selectedObject.value.x, 0) - width;
  }
  cells = getObjectCells(selectedObject.value);
  if (cells.some((cell) => cell.y < range.minY)) {
    selectedObject.value.y = toInteger(selectedObject.value.y, 0) + height;
  } else if (cells.some((cell) => cell.y > range.maxY)) {
    selectedObject.value.y = toInteger(selectedObject.value.y, 0) - height;
  }
}

function cancelZoomFrame() {
  if (!zoomAnimationFrame) {
    return;
  }
  window.cancelAnimationFrame(zoomAnimationFrame);
  zoomAnimationFrame = 0;
  pendingZoomDirection = 0;
}

function syncSelectedObject() {
  const frame = ensureActiveFrame();
  if (!frame.matrix.some((object) => object.id === selectedObjectId.value)) {
    selectedObjectId.value = "";
  }
  stopSelectionMode();
  stopAnchorEdit();
}

function handleGlobalKeydown(event) {
  const tagName = event.target?.tagName?.toLowerCase();
  if (["input", "textarea", "select"].includes(tagName) || event.target?.isContentEditable) {
    return;
  }
  const movement = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[event.key];
  if (!movement || !selectedObject.value || selectionMode.value) {
    return;
  }
  event.preventDefault();
  moveSelectedObject(movement[0], movement[1]);
}

function toInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.trunc(number);
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
    ["起始关卡", value.startLevelIndex],
    ["启动方式", value.launchMethod],
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
  <div ref="fitViewportRef" class="simple-editor-fit-viewport">
    <div class="simple-editor-fit-shell" :style="editorFitShellStyle">
      <section ref="fitContentRef" class="workspace simple-editor-workspace" :style="editorFitContentStyle">
    <div class="editor-topbar">
      <button class="soft-button editor-back-button" type="button" @click="$emit('back')">返回列表</button>
      <div v-if="document" class="sequence-block frame-sequence-header">
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
                :class="{ active: displayedFrameIndex === index }"
                type="button"
                @click="selectFrame(index)"
              >
                <span class="frame-tick-dot"></span>
                <span class="frame-tick-label">{{ index + 1 }}</span>
              </button>
            </div>
          </div>
          <div class="frame-icon-actions">
            <button class="icon-add-button" type="button" aria-label="添加帧" data-tip="添加帧" @click="addFrame">
              +
            </button>
            <button
              class="icon-add-button"
              type="button"
              aria-label="复制当前帧到前一帧"
              data-tip="复制当前帧到前一帧"
              :disabled="activeFrameIndex <= 0"
              @click="copyCurrentFrameToPreviousFrame"
            >
              P
            </button>
            <button
              class="icon-add-button"
              type="button"
              aria-label="复制当前帧到后一帧"
              data-tip="复制当前帧到后一帧"
              :disabled="activeFrameIndex >= frames.length - 1"
              @click="copyCurrentFrameToNextFrame"
            >
              N
            </button>
            <button
              class="icon-add-button"
              type="button"
              aria-label="复制当前帧到所有帧"
              data-tip="复制当前帧到所有帧"
              :disabled="frames.length <= 1"
              @click="copyCurrentFrameToAllFrames"
            >
              =
            </button>
            <button
              class="icon-add-button icon-danger-button"
              type="button"
              aria-label="删除当前帧"
              data-tip="删除当前帧"
              :disabled="frames.length <= 1"
              @click="deleteCurrentFrame"
            >
              -
            </button>
            <button
              class="icon-add-button icon-danger-button"
              type="button"
              aria-label="删除所有帧"
              data-tip="删除所有帧"
              @click="deleteAllFrames"
            >
              *
            </button>
          </div>
        </div>
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
        <div class="level-sequence-row">
          <button class="icon-add-button" type="button" aria-label="添加关卡" title="添加关卡" @click="addLevel">
            +
          </button>
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

        <div class="matrix-status-bar" :class="{ active: panoramaMode || selectionMode || anchorEditMode }">
          <div class="matrix-status-main">
            <div class="matrix-status-title">
              <strong>{{ anchorEditMode ? "修改基准" : panoramaMode ? "全景编辑" : "矩阵编辑" }}</strong>
              <span>{{
                anchorEditMode
                  ? "点击对象内部格子作为新基准"
                  : panoramaMode
                    ? panoramaStatusText
                    : `${matrixWidth} x ${matrixHeight}`
              }}</span>
            </div>
            <div class="matrix-inline-fields">
              <label>
                <span>关卡</span>
                <input v-model="activeLevel.label" type="text" />
              </label>
              <label class="matrix-repeat-field">
                <span>重复</span>
                <div class="repeat-times-control">
                  <input v-model.number="activeFrame.repeatTimes" min="1" type="number" />
                  <button
                    class="inline-symbol-button"
                    type="button"
                    title="应用当前重复次数到当前关卡所有帧"
                    aria-label="应用当前重复次数到当前关卡所有帧"
                    @click="applyCurrentRepeatTimesToAllFrames"
                  >
                    *
                  </button>
                </div>
              </label>
            </div>
          </div>
          <div class="matrix-status-actions">
            <button class="soft-button compact-button" type="button" @click="togglePanoramaMode">
              {{ panoramaMode ? "退出全景" : "全景" }}
            </button>
            <button
              v-if="panoramaMode && !selectionMode && !anchorEditMode"
              class="soft-button compact-button"
              type="button"
              @click="enterSelectionMode"
            >
              选择
            </button>
            <template v-if="selectionMode">
              <span class="selection-count">已选 {{ mergeSelectionIds.length }}</span>
              <button class="soft-button compact-button" type="button" @click="mergeSelectedObjects">
                合并
              </button>
              <button class="soft-button compact-button" type="button" @click="stopSelectionMode">
                取消
              </button>
            </template>
          </div>
        </div>

        <div ref="matrixScrollRef" class="matrix-scroll" @wheel="zoomMatrix">
          <SimpleMatrixCanvas
            :cells="matrixCells"
            :column-count="matrixColumnCount"
            :row-count="matrixRowCount"
            :cell-size="matrixCellSizeValue"
            :gap-size="matrixGapSizeValue"
            :base-patch-cells="matrixBasePatchCells"
            :base-patch-version="matrixBasePatchVersion"
            :overlay-highlights="matrixOverlayHighlights"
            :range-create-enabled="!selectionMode && !anchorEditMode"
            @cell-click="handleCellClick"
            @cell-range-create="handleCellRangeCreate"
            @matrix-contextmenu="openContextMenu"
          />
        </div>

        <div
          v-if="contextMenu.visible"
          class="matrix-context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @click.stop
        >
          <button v-if="!selectionMode" type="button" @click="enterSelectionMode">选择</button>
          <template v-else>
            <button type="button" @click="mergeSelectedObjects">合并</button>
            <button type="button" @click="stopSelectionMode">取消</button>
          </template>
        </div>
      </main>

      <aside class="editor-panel editor-right">
        <div class="side-panel-heading">
          <h2>对象编辑</h2>
          <p>{{ selectedObject ? selectedObject.id : "未选中对象" }}</p>
        </div>
        <div class="editor-right-main">
          <div class="object-panel">
            <div class="object-panel-head">
              <h2>对象</h2>
              <p>{{ frameObjects.length }} items</p>
            </div>
            <div class="object-actions">
              <template v-if="anchorEditMode">
                <button
                  class="soft-button compact-button"
                  type="button"
                  @click="confirmAnchorEdit"
                >
                  确认
                </button>
                <button
                  class="soft-button compact-button"
                  type="button"
                  @click="stopAnchorEdit"
                >
                  取消
                </button>
              </template>
              <template v-else>
                <button
                  class="soft-button compact-button"
                  :disabled="!selectedObject"
                  type="button"
                  @click="rotateSelectedObjectCounterClockwise"
                >
                  左转90
                </button>
                <button
                  class="soft-button compact-button"
                  :disabled="!selectedObject"
                  type="button"
                  @click="rotateSelectedObjectClockwise"
                >
                  右转90
                </button>
                <button
                  class="soft-button compact-button"
                  :disabled="!selectedObject || !panoramaMode"
                  type="button"
                  @click="startAnchorEdit"
                >
                  修改基准
                </button>
                <button
                  class="soft-button compact-button layer-symbol-button"
                  :disabled="!selectedObjectCanMoveUp"
                  type="button"
                  title="层级 +1"
                  aria-label="层级加一"
                  @click="moveSelectedObjectLayerUp"
                >
                  +
                </button>
                <button
                  class="soft-button compact-button layer-symbol-button"
                  :disabled="!selectedObjectCanMoveDown"
                  type="button"
                  title="层级 -1"
                  aria-label="层级减一"
                  @click="moveSelectedObjectLayerDown"
                >
                  -
                </button>
                <button
                  class="soft-button compact-button layer-symbol-button"
                  :disabled="!selectedObject"
                  type="button"
                  title="应用当前层级到当前关卡所有帧"
                  aria-label="应用当前层级到当前关卡所有帧"
                  @click="applySelectedObjectLayerToAllFrames"
                >
                  ⇅
                </button>
                <button
                  class="soft-button compact-button"
                  :disabled="!selectedObject"
                  type="button"
                  @click="applyBrushColorToSelectedObject"
                >
                  改色
                </button>
                <button
                  class="soft-button compact-button"
                  :disabled="!selectedObject || activeFrameIndex <= 0"
                  type="button"
                  @click="copySelectedObjectToPreviousFrame"
                >
                  复制前帧
                </button>
                <button
                  class="soft-button compact-button"
                  :disabled="!selectedObject || activeFrameIndex >= frames.length - 1"
                  type="button"
                  @click="copySelectedObjectToNextFrame"
                >
                  复制后帧
                </button>
                <button
                  class="soft-button compact-button"
                  :disabled="!selectedObject || frames.length <= 1"
                  type="button"
                  @click="copySelectedObjectToAllFrames"
                >
                  复制全帧
                </button>
                <button
                  class="soft-button compact-button"
                  :disabled="!selectedObject"
                  type="button"
                  @click="deleteSelectedObject"
                >
                  删除
                </button>
              </template>
            </div>
            <div class="object-list">
              <button
                v-for="object in frameObjects"
                :key="object.id"
                class="object-row"
                :class="{ active: selectedObjectId === object.id }"
                type="button"
                @click="selectObject(object.id)"
              >
                <span class="object-color" :style="{ backgroundColor: colorOptions[object.color]?.value }"></span>
                <span class="object-main">
                  <strong>{{ object.id }}</strong>
                  <small>层 {{ object.index + 1 }}/{{ frameObjects.length }} · 基准 {{ object.x }},{{ object.y }} · Color {{ object.color }} · {{ object.occupiedCount }} 格</small>
                </span>
              </button>
            </div>
          </div>
          <div class="editor-side-rail">
            <div class="editor-side-section">
              <h2>画笔</h2>
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
                <p>对象：{{ frameObjects.length }}</p>
              </div>
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
              <button
                class="soft-button runtime-start-button"
                :disabled="Boolean(busyAction) || !document"
                type="button"
                @click="validateEditor"
              >
                校验
              </button>
              <button
                class="soft-button runtime-start-button"
                :disabled="Boolean(busyAction) || !document"
                type="button"
                @click="saveEditor"
              >
                保存
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
          </div>
        </div>
      </aside>
    </div>
      </section>
    </div>
  </div>
</template>
