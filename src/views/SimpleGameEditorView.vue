<script setup>
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from "vue";
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
const selectedObjectId = ref("");
const panoramaMode = ref(false);
const selectionMode = ref(false);
const mergeSelectionIds = ref([]);
const anchorEditMode = ref(false);
const anchorCandidate = ref(null);
const objectIdCounter = ref(0);
const contextMenu = ref({ visible: false, x: 0, y: 0 });
let pendingZoomDirection = 0;
let zoomAnimationFrame = 0;

const PANORAMA_PADDING = 8;

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
const matrixCellSizeValue = computed(() => Math.round(18 * matrixZoom.value));
const matrixGapSizeValue = computed(() => Math.max(1, Math.round(2 * matrixZoom.value)));
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
const mergeSelectionIdSet = computed(() => new Set(mergeSelectionIds.value));
const colorOptions = computed(() => [
  { index: 0, label: "Color 0", value: normalizeColor(document.value?.color0, "#00ff00") },
  { index: 1, label: "Color 1", value: normalizeColor(document.value?.color1, "#0000ff") },
  { index: 2, label: "Color 2", value: normalizeColor(document.value?.color2, "#ff00ff") },
  { index: 3, label: "Color 3", value: normalizeColor(document.value?.color3, "#ffffff") },
]);
const matrixCells = computed(() => {
  const cells = [];
  for (const row of matrixRows.value) {
    for (const column of matrixColumns.value) {
      const cell = expandedCellMap.value.get(createPointKey(column, row));
      const objectId = cell?.object?.id || "";
      const realCell = isRealCell(column, row);
      const selected = Boolean(objectId && objectId === selectedObjectId.value);
      const mergeSelected = Boolean(objectId && mergeSelectionIdSet.value.has(objectId));
      const anchorHighlighted = isAnchorHighlighted(column, row, cell?.object);
      const colorIndex = clampColorIndex(cell?.object?.color);
      const color = cell?.object
        ? colorOptions.value[colorIndex]?.value || "#26313d"
        : realCell
          ? "#303b49"
          : "#101821";
      cells.push({
        key: `${column}:${row}`,
        x: column,
        y: row,
        color,
        title: objectId ? `x ${column}, y ${row}, ${objectId}` : `x ${column}, y ${row}`,
        classes: {
          "real-cell": realCell,
          "virtual-cell": !realCell,
          "object-cell": Boolean(cell),
          "selected-object-cell": selected,
          "merge-selected-cell": mergeSelected,
          "anchor-cell": anchorHighlighted,
        },
        memo: `${objectId}:${color}:${realCell ? 1 : 0}:${selected ? 1 : 0}:${mergeSelected ? 1 : 0}:${anchorHighlighted ? 1 : 0}`,
      });
    }
  }
  return cells;
});
const runtimeSummary = computed(() => formatRuntimeSummary(runtimeResult.value));
const frameObjects = computed(() =>
  (activeFrame.value?.matrix || []).map((object, index) => createObjectSummary(object, index)),
);
const selectedObject = computed(() =>
  (activeFrame.value?.matrix || []).find((object) => object.id === selectedObjectId.value) || null,
);
const expandedCellMap = computed(() => {
  const map = new Map();
  for (const object of activeFrame.value?.matrix || []) {
    for (const cell of getObjectCells(object)) {
      const key = createPointKey(cell.x, cell.y);
      if (!map.has(key)) {
        map.set(key, { ...cell, object });
      }
    }
  }
  return map;
});
const panoramaStatusText = computed(
  () =>
    `x ${matrixRange.value.minX}..${matrixRange.value.maxX}, y ${matrixRange.value.minY}..${matrixRange.value.maxY}`,
);

onMounted(() => {
  loadEditor();
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("click", closeContextMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("click", closeContextMenu);
  cancelZoomFrame();
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
    selectedObjectId.value = "";
    stopSelectionMode();
    panoramaMode.value = false;
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
  syncSelectedObject();
}

function selectFrame(index) {
  activeFrameIndex.value = index;
  ensureActiveFrame();
  syncSelectedObject();
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
  syncSelectedObject();
}

function addFrame() {
  const level = activeLevel.value;
  if (!level) {
    return;
  }
  level.frameList ||= [];
  level.frameList.push(createBlankFrame());
  activeFrameIndex.value = level.frameList.length - 1;
  syncSelectedObject();
}

function deleteCurrentFrame() {
  const level = activeLevel.value;
  if (!level?.frameList?.length) {
    return;
  }
  level.frameList.splice(activeFrameIndex.value, 1);
  if (!level.frameList.length) {
    level.frameList.push(createBlankFrame());
  }
  activeFrameIndex.value = Math.min(activeFrameIndex.value, level.frameList.length - 1);
  syncSelectedObject();
}

function deleteAllFrames() {
  const level = activeLevel.value;
  if (!level) {
    return;
  }
  level.frameList = [createBlankFrame()];
  activeFrameIndex.value = 0;
  syncSelectedObject();
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
  if (existing) {
    return;
  }
  const object = createMatrixObject(x, y, selectedColor.value, frame);
  frame.matrix.push(object);
  selectedObjectId.value = object.id;
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
  const occupiedCell = cells.find((cell) => expandedCellMap.value.has(createPointKey(cell.x, cell.y)));
  if (occupiedCell) {
    statusMessage.value = "框选区域包含已有对象，未创建新对象";
    return;
  }
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
  selectedObjectId.value = object.id;
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
}

function deleteSelectedObject() {
  const frame = ensureActiveFrame();
  const index = frame.matrix.findIndex((object) => object.id === selectedObjectId.value);
  if (index < 0) {
    return;
  }
  frame.matrix.splice(index, 1);
  selectedObjectId.value = "";
  stopSelectionMode();
  stopAnchorEdit();
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
    copied += 1;
  });
  statusMessage.value = copied ? `已更新 ${copied} 帧` : "没有可复制的目标帧";
}

function copySelectedObjectToFrame(frameIndex) {
  if (!selectedObject.value || frameIndex < 0 || frameIndex >= frames.value.length) {
    return;
  }
  upsertObjectInFrame(selectedObject.value, frames.value[frameIndex]);
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
    copied += 1;
  });
  statusMessage.value = copied ? `当前帧已复制到 ${copied} 帧` : "没有可复制的目标帧";
}

function copyCurrentFrameToFrame(frameIndex) {
  if (frameIndex < 0 || frameIndex >= frames.value.length) {
    return;
  }
  replaceFrameObjects(ensureActiveFrame(), frames.value[frameIndex]);
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
  if (!cell?.object || cell.object.id !== selectedObjectId.value) {
    return;
  }
  anchorCandidate.value = {
    objectId: cell.object.id,
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
  if (!cell?.object) {
    return;
  }
  if (!isSingleCellObject(cell.object)) {
    statusMessage.value = "只能合并单格对象";
    return;
  }
  const id = cell.object.id;
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
    });
  });
  return payload;
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

function isAnchorHighlighted(x, y, object) {
  if (anchorEditMode.value && object?.id === selectedObjectId.value) {
    const anchor = anchorCandidate.value || object;
    return x === toInteger(anchor.x, 0) && y === toInteger(anchor.y, 0);
  }
  const mergeAnchorId = mergeSelectionIds.value[0];
  if (!mergeAnchorId || object?.id !== mergeAnchorId) {
    return false;
  }
  const anchorCell = getObjectCells(object)[0];
  return x === anchorCell?.x && y === anchorCell?.y;
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

        <div class="matrix-status-bar" :class="{ active: panoramaMode || selectionMode || anchorEditMode }">
          <div>
            <strong>{{ anchorEditMode ? "修改基准" : panoramaMode ? "全景编辑" : "矩阵编辑" }}</strong>
            <span>{{
              anchorEditMode
                ? "点击对象内部格子作为新基准"
                : panoramaMode
                  ? panoramaStatusText
                  : `${matrixWidth} x ${matrixHeight}`
            }}</span>
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

        <div class="matrix-scroll" @wheel="zoomMatrix">
          <SimpleMatrixCanvas
            :cells="matrixCells"
            :column-count="matrixColumnCount"
            :row-count="matrixRowCount"
            :cell-size="matrixCellSizeValue"
            :gap-size="matrixGapSizeValue"
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
          <p>对象：{{ frameObjects.length }}</p>
        </div>
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
                <small>基准 {{ object.x }},{{ object.y }} · Color {{ object.color }} · {{ object.occupiedCount }} 格</small>
              </span>
            </button>
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
