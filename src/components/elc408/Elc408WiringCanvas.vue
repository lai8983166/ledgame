<script setup>
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { findPoint } from "../../lib/elc408/elc408Wiring.js";

const props = defineProps({
  document: { type: Object, required: true },
});
const emit = defineEmits([
  "append-point",
  "append-rectangle",
  "delete-point",
  "delete-rectangle",
]);

const { t } = useI18n({ useScope: "global" });
const canvasRef = ref(null);
const containerRef = ref(null);
let ctx = null;
let resizeObserver = null;
let renderRAF = 0;

const dragState = ref(null);
const DRAG_THRESHOLD = 4;

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }
  ctx = canvas.getContext("2d");
  resizeObserver = new ResizeObserver(() => scheduleRender());
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }
  scheduleRender();
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (renderRAF) {
    cancelAnimationFrame(renderRAF);
  }
});

watch(
  () => props.document,
  () => scheduleRender(),
  { deep: true },
);

function scheduleRender() {
  if (renderRAF) {
    cancelAnimationFrame(renderRAF);
  }
  renderRAF = requestAnimationFrame(render);
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) {
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const containerWidth = containerRef.value?.clientWidth || 320;
  const containerHeight = containerRef.value?.clientHeight || 240;
  const cssWidth = Math.max(64, containerWidth);
  const cssHeight = Math.max(64, containerHeight);
  if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const { width, height } = props.document;
  if (width <= 0 || height <= 0) {
    return;
  }
  const cell = Math.max(8, Math.min(cssWidth / width, cssHeight / height));
  const totalWidth = cell * width;
  const totalHeight = cell * height;
  const offsetX = Math.max(0, (cssWidth - totalWidth) / 2);
  const offsetY = Math.max(0, (cssHeight - totalHeight) / 2);

  // grid
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 1) {
    ctx.beginPath();
    ctx.moveTo(offsetX + x * cell, offsetY);
    ctx.lineTo(offsetX + x * cell, offsetY + totalHeight);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 1) {
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + y * cell);
    ctx.lineTo(offsetX + totalWidth, offsetY + y * cell);
    ctx.stroke();
  }

  // points
  props.document.lines.forEach((line, lineIndex) => {
    const color = channelColor(lineIndex);
    if (!line || line.length === 0) {
      return;
    }
    // connecting line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    line.forEach((point, idx) => {
      const [px, py] = point;
      const cx = offsetX + (px + 0.5) * cell;
      const cy = offsetY + (py + 0.5) * cell;
      if (idx === 0) {
        ctx.moveTo(cx, cy);
      } else {
        ctx.lineTo(cx, cy);
      }
    });
    ctx.stroke();
    // shapes and labels
    line.forEach((point, pixelIndex) => {
      const [px, py] = point;
      const cx = offsetX + (px + 0.5) * cell;
      const cy = offsetY + (py + 0.5) * cell;
      const radius = cell * 0.36;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (pixelIndex === 0) {
        // first point: quadrilateral (small square)
        ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
      } else {
        // hexagon
        for (let k = 0; k < 6; k += 1) {
          const angle = (k / 6) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
      ctx.fill();
      ctx.fillStyle = "#0a0e14";
      ctx.font = `${Math.max(8, Math.floor(cell * 0.4))}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(pixelIndex + 1), cx, cy);
    });
  });

  // selection rectangle preview
  const drag = dragState.value;
  if (drag && drag.moved) {
    const start = pixelToCell(drag.startX, drag.startY, cell, offsetX, offsetY);
    const end = pixelToCell(drag.currentX, drag.currentY, cell, offsetX, offsetY);
    const x = offsetX + Math.min(start.x, end.x) * cell;
    const y = offsetY + Math.min(start.y, end.y) * cell;
    const w = (Math.abs(end.x - start.x) + 1) * cell;
    const h = (Math.abs(end.y - start.y) + 1) * cell;
    ctx.strokeStyle = drag.rightButton ? "rgba(255,90,90,0.7)" : "rgba(120,180,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}

function pixelToCell(x, y, cell, offsetX, offsetY) {
  return {
    x: Math.floor((x - offsetX) / cell),
    y: Math.floor((y - offsetY) / cell),
  };
}

function getMousePos(event) {
  const canvas = canvasRef.value;
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function onPointerDown(event) {
  const pos = getMousePos(event);
  dragState.value = {
    startX: pos.x,
    startY: pos.y,
    currentX: pos.x,
    currentY: pos.y,
    moved: false,
    rightButton: event.button === 2,
  };
}

function onPointerMove(event) {
  const drag = dragState.value;
  if (!drag) {
    return;
  }
  const pos = getMousePos(event);
  drag.currentX = pos.x;
  drag.currentY = pos.y;
  if (!drag.moved && Math.abs(pos.x - drag.startX) + Math.abs(pos.y - drag.startY) > DRAG_THRESHOLD) {
    drag.moved = true;
  }
  scheduleRender();
}

function onPointerUp(event) {
  const drag = dragState.value;
  if (!drag) {
    return;
  }
  const pos = getMousePos(event);
  const doc = props.document;
  const cellLayout = computeCellLayout();
  if (!cellLayout) {
    dragState.value = null;
    return;
  }
  const startCell = pixelToCell(drag.startX, drag.startY, cellLayout.cell, cellLayout.offsetX, cellLayout.offsetY);
  if (!drag.moved) {
    // click
    if (isInBounds(doc, startCell.x, startCell.y)) {
      if (drag.rightButton) {
        emit("delete-point", { x: startCell.x, y: startCell.y });
      } else {
        emit("append-point", { x: startCell.x, y: startCell.y });
      }
    }
  } else {
    const endCell = pixelToCell(pos.x, pos.y, cellLayout.cell, cellLayout.offsetX, cellLayout.offsetY);
    if (drag.rightButton) {
      emit("delete-rectangle", {
        startX: startCell.x, startY: startCell.y, endX: endCell.x, endY: endCell.y,
      });
    } else {
      emit("append-rectangle", {
        startX: startCell.x, startY: startCell.y, endX: endCell.x, endY: endCell.y,
      });
    }
  }
  dragState.value = null;
  scheduleRender();
}

function onPointerLeave() {
  dragState.value = null;
  scheduleRender();
}

function onContextMenu(event) {
  // Block the browser context menu only inside the canvas.
  event.preventDefault();
}

function computeCellLayout() {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) {
    return null;
  }
  const cssWidth = container.clientWidth || 320;
  const cssHeight = container.clientHeight || 240;
  const { width, height } = props.document;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const cell = Math.max(8, Math.min(cssWidth / width, cssHeight / height));
  const totalWidth = cell * width;
  const totalHeight = cell * height;
  const offsetX = Math.max(0, (cssWidth - totalWidth) / 2);
  const offsetY = Math.max(0, (cssHeight - totalHeight) / 2);
  return { cell, offsetX, offsetY };
}

function isInBounds(document, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0
    && x < document.width && y < document.height;
}

function channelColor(index) {
  const palette = [
    "#ff6b6b", "#4ecdc4", "#ffe66d", "#a78bfa", "#7bc043",
    "#f49ac0", "#76c4ae", "#ffa94d", "#90e0ef", "#c8b6ff",
    "#fcbf49", "#a3d977", "#ff8fab", "#bde0fe", "#cdb4db",
    "#ff99c8", "#fcf6bd", "#d0f4de", "#a9def9", "#e4c1f9",
  ];
  return palette[index % palette.length];
}
</script>

<template>
  <div ref="containerRef" class="elc408-wiring-canvas">
    <canvas
      ref="canvasRef"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerLeave"
      @pointercancel="onPointerLeave"
      @contextmenu="onContextMenu"
    />
  </div>
</template>

<style scoped>
.elc408-wiring-canvas {
  flex: 1;
  min-height: 280px;
  display: flex;
  background: #0a0e14;
  border: 1px solid #2e3947;
  border-radius: 6px;
  box-shadow:
    0 8px 22px rgba(37, 46, 57, 0.17),
    inset 0 0 0 1px rgba(255, 255, 255, 0.035);
  overflow: hidden;
}
.elc408-wiring-canvas canvas {
  flex: 1;
  min-width: 0;
  touch-action: none;
  cursor: crosshair;
}
</style>
