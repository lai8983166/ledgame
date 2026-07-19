<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  cells: {
    type: Array,
    required: true,
  },
  columnCount: {
    type: Number,
    required: true,
  },
  rowCount: {
    type: Number,
    required: true,
  },
  cellSize: {
    type: Number,
    required: true,
  },
  gapSize: {
    type: Number,
    required: true,
  },
  rangeCreateEnabled: {
    type: Boolean,
    default: true,
  },
  objectDragEnabled: {
    type: Boolean,
    default: false,
  },
  outsideRangeCreateEnabled: {
    type: Boolean,
    default: false,
  },
  outsideRangePadding: {
    type: Number,
    default: 2,
  },
  basePatchCells: {
    type: Array,
    default: () => [],
  },
  basePatchVersion: {
    type: Number,
    default: 0,
  },
  overlayHighlights: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  "cell-click",
  "cell-range-create",
  "object-drag-start",
  "object-drag",
  "object-drag-end",
  "cell-hover",
  "matrix-contextmenu",
]);
const { t } = useI18n();

const baseCanvasRef = ref(null);
const overlayCanvasRef = ref(null);
let hoverCell = null;
let dragStartCell = null;
let dragCurrentCell = null;
let baseAnimationFrame = 0;
let overlayAnimationFrame = 0;
let pendingBaseDrawMode = "full";
let pendingBasePatchCells = [];
let appliedBasePatchVersion = 0;
let lastGeometrySignature = "";
// Offscreen cache of the empty grid (all cells drawn as-if-empty: bg fill + grid stroke).
// Keyed by createGeometrySignature(); rebuilt only when cellSize/gap/cols/rows change, so
// full redraws (e.g. frame switches) become one drawImage + O(objects) instead of O(cells).
let emptyGridCanvas = null;
let emptyGridSignature = "";

const stride = computed(() => props.cellSize + props.gapSize);
const canvasWidth = computed(() =>
  props.columnCount ? props.columnCount * props.cellSize + Math.max(0, props.columnCount - 1) * props.gapSize : 0,
);
const canvasHeight = computed(() =>
  props.rowCount ? props.rowCount * props.cellSize + Math.max(0, props.rowCount - 1) * props.gapSize : 0,
);
const outsidePaddingCells = computed(() =>
  props.outsideRangeCreateEnabled ? Math.max(0, Math.floor(props.outsideRangePadding)) : 0,
);
const outsidePaddingPixels = computed(() => outsidePaddingCells.value * stride.value);
const interactionCanvasWidth = computed(() => canvasWidth.value + outsidePaddingPixels.value * 2);
const interactionCanvasHeight = computed(() => canvasHeight.value + outsidePaddingPixels.value * 2);
const wrapperStyle = computed(() => ({
  width: `${interactionCanvasWidth.value}px`,
  height: `${interactionCanvasHeight.value}px`,
}));
const baseCanvasStyle = computed(() => ({
  width: `${canvasWidth.value}px`,
  height: `${canvasHeight.value}px`,
  left: `${outsidePaddingPixels.value}px`,
  top: `${outsidePaddingPixels.value}px`,
}));
const overlayCanvasStyle = computed(() => ({
  width: `${interactionCanvasWidth.value}px`,
  height: `${interactionCanvasHeight.value}px`,
}));

onMounted(() => {
  scheduleBaseDraw();
  scheduleOverlayDraw();
});

onBeforeUnmount(() => {
  if (baseAnimationFrame) {
    window.cancelAnimationFrame(baseAnimationFrame);
  }
  if (overlayAnimationFrame) {
    window.cancelAnimationFrame(overlayAnimationFrame);
  }
  emptyGridCanvas = null;
  emptyGridSignature = "";
});

watch(
  () => [
    props.cells,
    props.columnCount,
    props.rowCount,
    props.cellSize,
    props.gapSize,
    props.basePatchVersion,
  ],
  () => {
    const request = resolveBaseDrawMode();
    scheduleBaseDraw(request.mode, request.cells);
    scheduleOverlayDraw();
  },
  { flush: "post" },
);

watch(
  () => [
    props.rangeCreateEnabled,
    props.objectDragEnabled,
    props.outsideRangeCreateEnabled,
    props.outsideRangePadding,
    props.overlayHighlights,
  ],
  () => {
    if (!props.rangeCreateEnabled && !props.objectDragEnabled) {
      dragStartCell = null;
      dragCurrentCell = null;
    }
    scheduleOverlayDraw();
  },
  { flush: "post" },
);

function scheduleBaseDraw(mode = "full", patchCells = []) {
  if (mode === "full" || pendingBaseDrawMode === "full") {
    pendingBaseDrawMode = "full";
    pendingBasePatchCells = [];
  } else {
    pendingBaseDrawMode = "patch";
    pendingBasePatchCells = dedupePatchCells([...pendingBasePatchCells, ...patchCells]);
  }
  if (baseAnimationFrame) {
    return;
  }
  baseAnimationFrame = window.requestAnimationFrame(() => {
    baseAnimationFrame = 0;
    const drawMode = pendingBaseDrawMode;
    const patchCells = pendingBasePatchCells;
    pendingBaseDrawMode = "full";
    pendingBasePatchCells = [];
    if (drawMode === "patch" && patchCells.length) {
      drawBasePatch(patchCells);
      return;
    }
    drawBaseCanvas();
  });
}

function scheduleOverlayDraw() {
  if (overlayAnimationFrame) {
    return;
  }
  overlayAnimationFrame = window.requestAnimationFrame(() => {
    overlayAnimationFrame = 0;
    drawOverlayCanvas();
  });
}

function drawBaseCanvas() {
  const canvas = baseCanvasRef.value;
  if (!canvas || !canvasWidth.value || !canvasHeight.value) {
    return;
  }
  const width = canvasWidth.value;
  const height = canvasHeight.value;
  const context = prepareCanvas(canvas, width, height);
  context.clearRect(0, 0, width, height);
  // Blit the cached empty grid (built once per geometry change), then draw only the
  // occupied cells on top — O(objects) instead of redrawing every (mostly empty) cell.
  const background = prepareEmptyGridBackground();
  if (background) {
    context.drawImage(background, 0, 0, width, height);
  }
  for (let index = 0; index < props.cells.length; index += 1) {
    const cell = props.cells[index];
    if (cell && cell.classes && cell.classes["object-cell"]) {
      drawCellOverlay(context, cell, index);
    }
  }
  lastGeometrySignature = createGeometrySignature();
  appliedBasePatchVersion = props.basePatchVersion;
}

function drawBasePatch(patchCells) {
  const canvas = baseCanvasRef.value;
  if (!canvas || !canvasWidth.value || !canvasHeight.value) {
    return;
  }
  if (lastGeometrySignature !== createGeometrySignature()) {
    drawBaseCanvas();
    return;
  }
  const width = canvasWidth.value;
  const height = canvasHeight.value;
  const context = prepareCanvas(canvas, width, height);
  for (const patchCell of patchCells) {
    const renderCell = findRenderCell(patchCell);
    if (!renderCell) {
      continue;
    }
    const position = getGridCellPosition(renderCell);
    if (!position) {
      continue;
    }
    const clearOffset = Math.max(4, Math.ceil(props.cellSize * 0.16));
    context.clearRect(
      position.left - clearOffset,
      position.top - clearOffset,
      props.cellSize + clearOffset * 2,
      props.cellSize + clearOffset * 2,
    );
    drawCell(context, renderCell, renderCell.renderIndex);
  }
  appliedBasePatchVersion = props.basePatchVersion;
}

function drawOverlayCanvas() {
  const canvas = overlayCanvasRef.value;
  if (!canvas || !interactionCanvasWidth.value || !interactionCanvasHeight.value) {
    return;
  }
  const width = interactionCanvasWidth.value;
  const height = interactionCanvasHeight.value;
  const context = prepareCanvas(canvas, width, height);
  context.clearRect(0, 0, width, height);
  drawOverlayHighlights(context);
  drawHoverOutline(context);
  drawDragSelection(context);
}

function prepareCanvas(canvas, width, height) {
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function drawEmptyCell(context, index) {
  const columnIndex = index % props.columnCount;
  const rowIndex = Math.floor(index / props.columnCount);
  const left = columnIndex * stride.value;
  const top = rowIndex * stride.value;
  const size = props.cellSize;
  const cell = props.cells[index];
  const classes = cell?.classes || {};
  const realCell = Boolean(classes["real-cell"]);
  const virtualCell = Boolean(classes["virtual-cell"]);

  context.globalAlpha = virtualCell ? 0.78 : 1;
  context.fillStyle = "#000000";
  context.fillRect(left, top, size, size);

  context.globalAlpha = 1;
  context.lineWidth = 1;
  context.setLineDash(virtualCell ? [3, 2] : []);
  context.strokeStyle = realCell
    ? "rgba(190, 205, 220, 0.28)"
    : "rgba(100, 110, 124, 0.34)";
  context.strokeRect(left + 0.5, top + 0.5, Math.max(0, size - 1), Math.max(0, size - 1));
  context.stroke();
  context.setLineDash([]);

  if (realCell) {
    context.strokeStyle = "rgba(93, 121, 151, 0.12)";
    context.strokeRect(left - 0.5, top - 0.5, size + 1, size + 1);
  }
}

function drawCellOverlay(context, cell, index) {
  const columnIndex = index % props.columnCount;
  const rowIndex = Math.floor(index / props.columnCount);
  const left = columnIndex * stride.value;
  const top = rowIndex * stride.value;
  const size = props.cellSize;
  const classes = cell.classes || {};
  const realCell = Boolean(classes["real-cell"]);
  const virtualCell = Boolean(classes["virtual-cell"]);
  const objectCell = Boolean(classes["object-cell"]);
  const overlapCell = Boolean(classes["overlap-cell"]);

  // Opaque object fill covers the empty-grid background for this cell.
  context.globalAlpha = 1;
  context.fillStyle = cell.color || "#000000";
  context.fillRect(left, top, size, size);

  // Redraw the grid stroke ON TOP of the object fill to match the non-cached look
  // (drawCell originally strokes after filling).
  context.lineWidth = objectCell ? 1.25 : 1;
  context.setLineDash(virtualCell ? [3, 2] : []);
  context.strokeStyle = objectCell
    ? "rgba(0, 0, 0, 0.84)"
    : realCell
      ? "rgba(190, 205, 220, 0.34)"
      : "rgba(100, 110, 124, 0.42)";
  context.strokeRect(left + 0.5, top + 0.5, Math.max(0, size - 1), Math.max(0, size - 1));
  context.stroke();
  context.setLineDash([]);

  if (realCell) {
    context.strokeStyle = "rgba(93, 121, 151, 0.12)";
    context.strokeRect(left - 0.5, top - 0.5, size + 1, size + 1);
  }

  if (overlapCell) {
    drawOverlapIndicator(context, left, top, size, cell.overlapCount);
  }
}

// Full single-cell repaint (used by the patch path after clearing a cell region):
// empty background + object overlay if the cell is occupied.
function drawCell(context, cell, index) {
  drawEmptyCell(context, index);
  if (cell?.classes?.["object-cell"]) {
    drawCellOverlay(context, cell, index);
  }
}

function prepareEmptyGridBackground() {
  const width = canvasWidth.value;
  const height = canvasHeight.value;
  if (!width || !height) {
    return null;
  }
  const signature = createGeometrySignature();
  if (emptyGridCanvas && emptyGridSignature === signature) {
    return emptyGridCanvas;
  }
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  for (let index = 0; index < props.cells.length; index += 1) {
    drawEmptyCell(context, index);
  }
  emptyGridCanvas = canvas;
  emptyGridSignature = signature;
  return canvas;
}

function drawOverlapIndicator(context, left, top, size, overlapCount) {
  const markerSize = Math.max(4, Math.min(9, Math.round(size * 0.32)));
  const markerLeft = left + size - markerSize - 2;
  const markerTop = top + 2;
  context.save();
  context.fillStyle = "rgba(11, 18, 28, 0.72)";
  context.strokeStyle = "rgba(255, 255, 255, 0.58)";
  context.lineWidth = 1;
  drawRoundedRect(context, markerLeft, markerTop, markerSize, markerSize, Math.min(3, markerSize / 2));
  context.fill();
  context.stroke();
  if (size >= 18 && overlapCount > 1) {
    context.fillStyle = "#f6d66f";
    context.font = `${Math.max(8, Math.round(size * 0.32))}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(Math.min(overlapCount, 9)), markerLeft + markerSize / 2, markerTop + markerSize / 2);
  }
  context.restore();
}

function drawOutline(context, left, top, size, color, lineWidth, offset) {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.strokeRect(left - offset, top - offset, size + offset * 2, size + offset * 2);
}

function drawRoundedRect(context, left, top, width, height, radius) {
  if (typeof context.roundRect === "function") {
    context.beginPath();
    context.roundRect(left, top, width, height, radius);
    return;
  }
  context.beginPath();
  context.rect(left, top, width, height);
}

function handlePointerDown(event) {
  if (event.button !== 0) {
    return;
  }
  const cell = getCellFromPointer(event);
  if (!cell) {
    return;
  }
  event.preventDefault();
  overlayCanvasRef.value?.setPointerCapture?.(event.pointerId);
  dragStartCell = cell;
  dragCurrentCell = cell;
  updateHoverCell(cell);
  if (props.objectDragEnabled) {
    emit("object-drag-start", cell);
  }
  scheduleOverlayDraw();
}

function handlePointerMove(event) {
  const cell = getCellFromPointer(event);
  updateHoverCell(cell);
  if (props.objectDragEnabled && dragStartCell && cell) {
    event.preventDefault();
    if (dragCurrentCell?.key === cell.key) {
      return;
    }
    dragCurrentCell = cell;
    emit("object-drag", {
      objectId: dragStartCell.objectId || "",
      start: dragStartCell,
      current: cell,
    });
    scheduleOverlayDraw();
    return;
  }
  if (!props.rangeCreateEnabled || !dragStartCell || !cell) {
    return;
  }
  if (dragCurrentCell?.key === cell.key) {
    return;
  }
  dragCurrentCell = cell;
  scheduleOverlayDraw();
}

function handlePointerUp(event) {
  if (!dragStartCell) {
    return;
  }
  overlayCanvasRef.value?.releasePointerCapture?.(event.pointerId);
  const startCell = dragStartCell;
  const endCell = getCellFromPointer(event) || dragCurrentCell || startCell;
  if (props.objectDragEnabled) {
    emit("object-drag-end", {
      objectId: startCell.objectId || "",
      start: startCell,
      current: endCell,
    });
  }
  dragStartCell = null;
  dragCurrentCell = null;
  scheduleOverlayDraw();
  if (props.objectDragEnabled) {
    return;
  }
  if (!endCell) {
    return;
  }
  if (!props.rangeCreateEnabled || startCell.key === endCell.key) {
    emit("cell-click", startCell.x, startCell.y);
    return;
  }
  emit("cell-range-create", {
    anchorX: startCell.x,
    anchorY: startCell.y,
    cells: getCellsInRange(startCell, endCell).map((cell) => ({ x: cell.x, y: cell.y })),
  });
}

function handlePointerCancel(event) {
  if (props.objectDragEnabled && dragStartCell) {
    emit("object-drag-end", {
      objectId: dragStartCell.objectId || "",
      start: dragStartCell,
      current: dragCurrentCell || dragStartCell,
      cancelled: true,
    });
  }
  overlayCanvasRef.value?.releasePointerCapture?.(event.pointerId);
  dragStartCell = null;
  dragCurrentCell = null;
  scheduleOverlayDraw();
}

function handleContextMenu(event) {
  emit("matrix-contextmenu", event);
}

function updateHoverCell(cell) {
  const nextKey = cell?.key || "";
  updateCanvasTitle(buildCellTitle(cell));
  if (nextKey === (hoverCell?.key || "")) {
    return;
  }
  hoverCell = cell || null;
  emit("cell-hover", hoverCell ? { x: hoverCell.x, y: hoverCell.y } : null);
  scheduleOverlayDraw();
}

function buildCellTitle(cell) {
  if (!cell) {
    return t("simple.matrixCanvasLabel");
  }
  const parts = [`x ${cell.x}`, `y ${cell.y}`];
  if (cell.objectId) {
    parts.push(cell.objectId);
  }
  if (cell.overlapCount > 1) {
    parts.push(t("simple.overlapLayersPlain", { count: cell.overlapCount }));
  }
  return parts.join(", ");
}

function clearHover() {
  if (!hoverCell) {
    return;
  }
  hoverCell = null;
  emit("cell-hover", null);
  updateCanvasTitle(t("simple.matrixCanvasLabel"));
  scheduleOverlayDraw();
}

function updateCanvasTitle(title) {
  const canvas = overlayCanvasRef.value;
  if (canvas && canvas.title !== title) {
    canvas.title = title;
  }
}

function getCellFromPointer(event) {
  const canvas = overlayCanvasRef.value;
  if (!canvas || !props.columnCount || !props.rowCount) {
    return null;
  }
  const bounds = canvas.getBoundingClientRect();
  const scaleX = interactionCanvasWidth.value / bounds.width;
  const scaleY = interactionCanvasHeight.value / bounds.height;
  const localX = (event.clientX - bounds.left) * scaleX;
  const localY = (event.clientY - bounds.top) * scaleY;
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= interactionCanvasWidth.value ||
    localY >= interactionCanvasHeight.value
  ) {
    return null;
  }
  const gridLocalX = localX - outsidePaddingPixels.value;
  const gridLocalY = localY - outsidePaddingPixels.value;
  const columnIndex = Math.floor(gridLocalX / stride.value);
  const rowIndex = Math.floor(gridLocalY / stride.value);
  const cellLocalX = gridLocalX - columnIndex * stride.value;
  const cellLocalY = gridLocalY - rowIndex * stride.value;
  if (cellLocalX >= props.cellSize || cellLocalY >= props.cellSize) {
    return null;
  }
  const insideGrid =
    columnIndex >= 0 &&
    columnIndex < props.columnCount &&
    rowIndex >= 0 &&
    rowIndex < props.rowCount;
  if (insideGrid) {
    const renderIndex = rowIndex * props.columnCount + columnIndex;
    const cell = props.cells[renderIndex];
    return cell
      ? { ...cell, renderIndex, canvasColumnIndex: columnIndex, canvasRowIndex: rowIndex }
      : null;
  }
  const padding = outsidePaddingCells.value;
  const insideInteractionPadding =
    props.outsideRangeCreateEnabled &&
    columnIndex >= -padding &&
    columnIndex < props.columnCount + padding &&
    rowIndex >= -padding &&
    rowIndex < props.rowCount + padding;
  if (!insideInteractionPadding) {
    return null;
  }
  const firstCell = props.cells[0];
  return {
    key: `outside:${columnIndex}:${rowIndex}`,
    x: Number(firstCell?.x || 0) + columnIndex,
    y: Number(firstCell?.y || 0) + rowIndex,
    objectId: "",
    overlapCount: 0,
    canvasColumnIndex: columnIndex,
    canvasRowIndex: rowIndex,
    classes: { "virtual-cell": true },
  };
}

function resolveBaseDrawMode() {
  if (lastGeometrySignature && lastGeometrySignature !== createGeometrySignature()) {
    return { mode: "full", cells: [] };
  }
  if (
    props.basePatchVersion > appliedBasePatchVersion &&
    props.basePatchCells.length
  ) {
    return { mode: "patch", cells: props.basePatchCells };
  }
  return { mode: "full", cells: [] };
}

function getCellsInRange(startCell, endCell) {
  const minX = Math.min(startCell.x, endCell.x);
  const maxX = Math.max(startCell.x, endCell.x);
  const minY = Math.min(startCell.y, endCell.y);
  const maxY = Math.max(startCell.y, endCell.y);
  return props.cells.filter((cell) => cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY);
}

function drawDragSelection(context) {
  if (!props.rangeCreateEnabled || !dragStartCell || !dragCurrentCell) {
    return;
  }
  const startPosition = getOverlayCellPosition(dragStartCell);
  const endPosition = getOverlayCellPosition(dragCurrentCell);
  if (!startPosition || !endPosition) {
    return;
  }
  const left = Math.min(startPosition.left, endPosition.left);
  const top = Math.min(startPosition.top, endPosition.top);
  const right = Math.max(startPosition.left, endPosition.left) + props.cellSize;
  const bottom = Math.max(startPosition.top, endPosition.top) + props.cellSize;
  context.save();
  context.setLineDash([6, 4]);
  context.lineWidth = 2;
  context.strokeStyle = "rgba(245, 248, 252, 0.88)";
  context.fillStyle = "rgba(112, 214, 179, 0.12)";
  context.fillRect(left - 2, top - 2, right - left + 4, bottom - top + 4);
  context.strokeRect(left - 2, top - 2, right - left + 4, bottom - top + 4);
  context.restore();
}

function drawHoverOutline(context) {
  if (!hoverCell) {
    return;
  }
  const position = getOverlayCellPosition(hoverCell);
  if (!position) {
    return;
  }
  drawOutline(context, position.left, position.top, props.cellSize, "rgba(219, 228, 241, 0.46)", 2, 1);
}

function drawOverlayHighlights(context) {
  for (const highlight of props.overlayHighlights || []) {
    const position = getOverlayCellPosition(highlight);
    if (!position) {
      continue;
    }
    if (highlight.type === "anchor") {
      drawAnchorOutline(context, position.left, position.top);
    } else if (highlight.type === "drag-preview") {
      drawDragPreview(context, position.left, position.top, highlight.color);
    } else if (highlight.type === "hover-object") {
      drawOutline(context, position.left, position.top, props.cellSize, "#71a7d8", 2, 1);
    } else if (highlight.type === "merge") {
      drawOutline(context, position.left, position.top, props.cellSize, "#70d6b3", 2, 1);
    } else {
      drawOutline(context, position.left, position.top, props.cellSize, "#f7d56f", 2, 1);
    }
  }
}

function drawDragPreview(context, left, top, color) {
  const size = props.cellSize;
  context.save();
  context.globalAlpha = 0.82;
  context.fillStyle = color || "#ffffff";
  context.fillRect(left, top, size, size);
  context.globalAlpha = 1;
  context.setLineDash([4, 3]);
  drawOutline(context, left, top, size, "#70d6b3", 2, 1);
  context.restore();
}

function drawAnchorOutline(context, left, top) {
  const size = props.cellSize;
  drawOutline(context, left, top, size, "#ff8a5c", 3, 2);
  context.strokeStyle = "rgba(255, 255, 255, 0.28)";
  context.lineWidth = 2;
  context.strokeRect(left + 3, top + 3, Math.max(1, size - 6), Math.max(1, size - 6));
}

function getGridCellPosition(cell) {
  const indices = getCellGridIndices(cell);
  if (!indices || indices.columnIndex < 0 || indices.rowIndex < 0) {
    return null;
  }
  return {
    left: indices.columnIndex * stride.value,
    top: indices.rowIndex * stride.value,
  };
}

function getOverlayCellPosition(cell) {
  const indices = getCellGridIndices(cell);
  if (!indices) {
    return null;
  }
  return {
    left: outsidePaddingPixels.value + indices.columnIndex * stride.value,
    top: outsidePaddingPixels.value + indices.rowIndex * stride.value,
  };
}

function getCellGridIndices(cell) {
  if (Number.isInteger(cell?.canvasColumnIndex) && Number.isInteger(cell?.canvasRowIndex)) {
    return {
      columnIndex: cell.canvasColumnIndex,
      rowIndex: cell.canvasRowIndex,
    };
  }
  const index = Number.isInteger(cell?.renderIndex)
    ? cell.renderIndex
    : props.cells.findIndex((item) =>
        cell?.key ? item.key === cell.key : item.x === cell?.x && item.y === cell?.y,
      );
  if (index < 0) {
    return null;
  }
  return {
    columnIndex: index % props.columnCount,
    rowIndex: Math.floor(index / props.columnCount),
  };
}

function findRenderCell(point) {
  const index = props.cells.findIndex((cell) => cell.x === point.x && cell.y === point.y);
  if (index < 0) {
    return null;
  }
  return { ...props.cells[index], renderIndex: index };
}

function createGeometrySignature() {
  return `${props.columnCount}:${props.rowCount}:${props.cellSize}:${props.gapSize}:${canvasWidth.value}:${canvasHeight.value}`;
}

function dedupePatchCells(cells) {
  const map = new Map();
  for (const cell of cells || []) {
    if (!Number.isFinite(Number(cell?.x)) || !Number.isFinite(Number(cell?.y))) {
      continue;
    }
    map.set(`${cell.x}:${cell.y}`, { x: Number(cell.x), y: Number(cell.y) });
  }
  return [...map.values()];
}
</script>

<template>
  <div class="editable-matrix matrix-canvas-wrapper" :style="wrapperStyle">
    <canvas
      ref="baseCanvasRef"
      class="matrix-canvas-surface matrix-base-canvas"
      :style="baseCanvasStyle"
      aria-hidden="true"
    ></canvas>
    <canvas
      ref="overlayCanvasRef"
      class="matrix-canvas-surface matrix-overlay-canvas"
      :class="{ 'matrix-object-drag-enabled': objectDragEnabled }"
      :style="overlayCanvasStyle"
      :title="t('simple.matrixCanvasLabel')"
      :aria-label="t('simple.matrixCanvasLabel')"
      @contextmenu.prevent.stop="handleContextMenu"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerCancel"
      @mouseleave="clearHover"
    ></canvas>
  </div>
</template>
