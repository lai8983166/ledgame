<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

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

const emit = defineEmits(["cell-click", "cell-range-create", "matrix-contextmenu"]);

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
const canvasStyle = computed(() => ({
  width: `${canvasWidth.value}px`,
  height: `${canvasHeight.value}px`,
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
  () => [props.rangeCreateEnabled, props.overlayHighlights],
  scheduleOverlayDraw,
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
    const position = getCellPosition(renderCell);
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
  if (!canvas || !canvasWidth.value || !canvasHeight.value) {
    return;
  }
  const width = canvasWidth.value;
  const height = canvasHeight.value;
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
  scheduleOverlayDraw();
}

function handlePointerMove(event) {
  const cell = getCellFromPointer(event);
  updateHoverCell(cell);
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
  dragStartCell = null;
  dragCurrentCell = null;
  scheduleOverlayDraw();
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
  scheduleOverlayDraw();
}

function buildCellTitle(cell) {
  if (!cell) {
    return "矩阵编辑区";
  }
  const parts = [`x ${cell.x}`, `y ${cell.y}`];
  if (cell.objectId) {
    parts.push(cell.objectId);
  }
  if (cell.overlapCount > 1) {
    parts.push(`重叠 ${cell.overlapCount} 层`);
  }
  return parts.join(", ");
}

function clearHover() {
  if (!hoverCell) {
    return;
  }
  hoverCell = null;
  updateCanvasTitle("矩阵编辑区");
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
  const scaleX = canvasWidth.value / bounds.width;
  const scaleY = canvasHeight.value / bounds.height;
  const localX = (event.clientX - bounds.left) * scaleX;
  const localY = (event.clientY - bounds.top) * scaleY;
  if (localX < 0 || localY < 0 || localX >= canvasWidth.value || localY >= canvasHeight.value) {
    return null;
  }
  const columnIndex = Math.floor(localX / stride.value);
  const rowIndex = Math.floor(localY / stride.value);
  const cellLocalX = localX - columnIndex * stride.value;
  const cellLocalY = localY - rowIndex * stride.value;
  if (
    columnIndex < 0 ||
    columnIndex >= props.columnCount ||
    rowIndex < 0 ||
    rowIndex >= props.rowCount ||
    cellLocalX >= props.cellSize ||
    cellLocalY >= props.cellSize
  ) {
    return null;
  }
  const renderIndex = rowIndex * props.columnCount + columnIndex;
  const cell = props.cells[renderIndex];
  return cell ? { ...cell, renderIndex } : null;
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
  const startPosition = getCellPosition(dragStartCell);
  const endPosition = getCellPosition(dragCurrentCell);
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
  const position = getCellPosition(hoverCell);
  if (!position) {
    return;
  }
  drawOutline(context, position.left, position.top, props.cellSize, "rgba(219, 228, 241, 0.46)", 2, 1);
}

function drawOverlayHighlights(context) {
  for (const highlight of props.overlayHighlights || []) {
    const position = getCellPosition(highlight);
    if (!position) {
      continue;
    }
    if (highlight.type === "anchor") {
      drawAnchorOutline(context, position.left, position.top);
    } else if (highlight.type === "merge") {
      drawOutline(context, position.left, position.top, props.cellSize, "#70d6b3", 2, 1);
    } else {
      drawOutline(context, position.left, position.top, props.cellSize, "#f7d56f", 2, 1);
    }
  }
}

function drawAnchorOutline(context, left, top) {
  const size = props.cellSize;
  drawOutline(context, left, top, size, "#ff8a5c", 3, 2);
  context.strokeStyle = "rgba(255, 255, 255, 0.28)";
  context.lineWidth = 2;
  context.strokeRect(left + 3, top + 3, Math.max(1, size - 6), Math.max(1, size - 6));
}

function getCellPosition(cell) {
  const index = Number.isInteger(cell?.renderIndex)
    ? cell.renderIndex
    : props.cells.findIndex((item) =>
        cell?.key ? item.key === cell.key : item.x === cell?.x && item.y === cell?.y,
      );
  if (index < 0) {
    return null;
  }
  const columnIndex = index % props.columnCount;
  const rowIndex = Math.floor(index / props.columnCount);
  return {
    left: columnIndex * stride.value,
    top: rowIndex * stride.value,
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
  <div class="editable-matrix matrix-canvas-wrapper" :style="canvasStyle">
    <canvas
      ref="baseCanvasRef"
      class="matrix-canvas-surface matrix-base-canvas"
      :style="canvasStyle"
      aria-hidden="true"
    ></canvas>
    <canvas
      ref="overlayCanvasRef"
      class="matrix-canvas-surface matrix-overlay-canvas"
      :style="canvasStyle"
      title="矩阵编辑区"
      aria-label="矩阵编辑区"
      @contextmenu.prevent.stop="handleContextMenu"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerCancel"
      @mouseleave="clearHover"
    ></canvas>
  </div>
</template>
