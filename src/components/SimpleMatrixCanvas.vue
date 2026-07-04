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
});

const emit = defineEmits(["cell-click", "cell-range-create", "matrix-contextmenu"]);

const canvasRef = ref(null);
const hoverCellKey = ref("");
const hoverTitle = ref("矩阵编辑区");
const dragStartCell = ref(null);
const dragCurrentCell = ref(null);
let animationFrame = 0;

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

onMounted(scheduleDraw);

onBeforeUnmount(() => {
  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
  }
});

watch(
  () => [
    props.cells,
    props.columnCount,
    props.rowCount,
    props.cellSize,
    props.gapSize,
    props.rangeCreateEnabled,
    hoverCellKey.value,
    dragStartCell.value,
    dragCurrentCell.value,
  ],
  scheduleDraw,
  { flush: "post" },
);

function scheduleDraw() {
  if (animationFrame) {
    return;
  }
  animationFrame = window.requestAnimationFrame(() => {
    animationFrame = 0;
    drawCanvas();
  });
}

function drawCanvas() {
  const canvas = canvasRef.value;
  if (!canvas || !canvasWidth.value || !canvasHeight.value) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  const width = canvasWidth.value;
  const height = canvasHeight.value;
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  for (let index = 0; index < props.cells.length; index += 1) {
    drawCell(context, props.cells[index], index);
  }
  drawDragSelection(context);
}

function drawCell(context, cell, index) {
  const columnIndex = index % props.columnCount;
  const rowIndex = Math.floor(index / props.columnCount);
  const left = columnIndex * stride.value;
  const top = rowIndex * stride.value;
  const size = props.cellSize;
  const classes = cell.classes || {};
  const realCell = Boolean(classes["real-cell"]);
  const virtualCell = Boolean(classes["virtual-cell"]);
  const selectedCell = Boolean(classes["selected-object-cell"]);
  const mergeSelectedCell = Boolean(classes["merge-selected-cell"]);
  const anchorCell = Boolean(classes["anchor-cell"]);
  const hoveredCell = cell.key === hoverCellKey.value;

  context.globalAlpha = virtualCell && !classes["object-cell"] ? 0.78 : 1;
  context.fillStyle = cell.color || (realCell ? "#303b49" : "#101821");
  drawRoundedRect(context, left, top, size, size, Math.min(4, size / 4));
  context.fill();

  context.globalAlpha = 1;
  context.lineWidth = 1;
  context.setLineDash(virtualCell ? [3, 2] : []);
  context.strokeStyle = realCell
    ? "rgba(210, 225, 244, 0.24)"
    : "rgba(143, 158, 176, 0.2)";
  drawRoundedRect(context, left + 0.5, top + 0.5, size - 1, size - 1, Math.min(4, size / 4));
  context.stroke();
  context.setLineDash([]);

  if (realCell) {
    context.strokeStyle = "rgba(93, 121, 151, 0.12)";
    context.strokeRect(left - 0.5, top - 0.5, size + 1, size + 1);
  }

  if (hoveredCell) {
    drawOutline(context, left, top, size, "rgba(219, 228, 241, 0.46)", 2, 1);
  }
  if (selectedCell) {
    drawOutline(context, left, top, size, "#f7d56f", 2, 1);
  }
  if (mergeSelectedCell) {
    drawOutline(context, left, top, size, "#70d6b3", 2, 1);
  }
  if (anchorCell) {
    drawOutline(context, left, top, size, "#ff8a5c", 3, 2);
    context.strokeStyle = "rgba(255, 255, 255, 0.28)";
    context.lineWidth = 2;
    context.strokeRect(left + 3, top + 3, Math.max(1, size - 6), Math.max(1, size - 6));
  }
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
  canvasRef.value?.setPointerCapture?.(event.pointerId);
  dragStartCell.value = cell;
  dragCurrentCell.value = cell;
  hoverCellKey.value = cell.key;
  hoverTitle.value = cell.title || "矩阵编辑区";
}

function handlePointerMove(event) {
  const cell = getCellFromPointer(event);
  updateHoverCell(cell);
  if (!props.rangeCreateEnabled || !dragStartCell.value || !cell) {
    return;
  }
  dragCurrentCell.value = cell;
}

function handlePointerUp(event) {
  if (!dragStartCell.value) {
    return;
  }
  canvasRef.value?.releasePointerCapture?.(event.pointerId);
  const startCell = dragStartCell.value;
  const endCell = getCellFromPointer(event) || dragCurrentCell.value || startCell;
  dragStartCell.value = null;
  dragCurrentCell.value = null;
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
  canvasRef.value?.releasePointerCapture?.(event.pointerId);
  dragStartCell.value = null;
  dragCurrentCell.value = null;
}

function handleContextMenu(event) {
  emit("matrix-contextmenu", event);
}

function handleMouseMove(event) {
  updateHoverCell(getCellFromPointer(event));
}

function updateHoverCell(cell) {
  const nextKey = cell?.key || "";
  hoverTitle.value = cell?.title || "矩阵编辑区";
  if (nextKey === hoverCellKey.value) {
    return;
  }
  hoverCellKey.value = nextKey;
}

function clearHover() {
  if (!hoverCellKey.value) {
    return;
  }
  hoverCellKey.value = "";
  hoverTitle.value = "矩阵编辑区";
}

function getCellFromPointer(event) {
  const canvas = canvasRef.value;
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
  return props.cells[rowIndex * props.columnCount + columnIndex] || null;
}

function getCellsInRange(startCell, endCell) {
  const minX = Math.min(startCell.x, endCell.x);
  const maxX = Math.max(startCell.x, endCell.x);
  const minY = Math.min(startCell.y, endCell.y);
  const maxY = Math.max(startCell.y, endCell.y);
  return props.cells.filter((cell) => cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY);
}

function drawDragSelection(context) {
  if (!props.rangeCreateEnabled || !dragStartCell.value || !dragCurrentCell.value) {
    return;
  }
  const startPosition = getCellPosition(dragStartCell.value);
  const endPosition = getCellPosition(dragCurrentCell.value);
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

function getCellPosition(cell) {
  const index = props.cells.findIndex((item) => item.key === cell.key);
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
</script>

<template>
  <div class="editable-matrix matrix-canvas-wrapper" :style="canvasStyle">
    <canvas
      ref="canvasRef"
      class="matrix-canvas-surface"
      :style="canvasStyle"
      :title="hoverTitle"
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
