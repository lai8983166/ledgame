import { getAbsoluteObjectCells } from './simpleObjectMerge.js';
import { selectSimpleTopItem } from './simpleLevelGif.js';

const cursor = (body, x, y, fallback) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${body}</svg>`)}") ${x} ${y}, ${fallback}`;

const BRUSH_CURSOR = cursor('<path d="M4 20l2-7L16 3l5 5L11 18z" fill="white" stroke="black" stroke-width="1.5"/><path d="M6 13l5 5M16 3l5 5M4 20l4-1" fill="none" stroke="black" stroke-width="1.5"/>', 4, 20, 'crosshair');
const ERASER_CURSOR = cursor('<path d="M3 14L14 3l8 8-10 10H9z" fill="white" stroke="black" stroke-width="1.5"/><path d="M7 10l9 9M3 22h19" stroke="black" stroke-width="1.5"/>', 3, 14, 'crosshair');

export function drawingToolCursor(tool, occupied = false, dragging = false) {
  if (tool === 'brush') return BRUSH_CURSOR;
  if (tool === 'eraser') return ERASER_CURSOR;
  return dragging ? 'grabbing' : occupied ? 'grab' : 'default';
}

// Interpolate in grid coordinates so a fast continuous gesture does not skip
// cells between browser pointer events. Include both ends; callers deduplicate.
export function drawingStrokeCells(start, end) {
  if (!start || !end || ![start.x, start.y, end.x, end.y].every(Number.isSafeInteger)) return [];
  let x = start.x, y = start.y;
  const dx = Math.abs(end.x - x), dy = Math.abs(end.y - y);
  const sx = x < end.x ? 1 : -1, sy = y < end.y ? 1 : -1;
  let error = dx - dy;
  const cells = [];
  while (true) {
    cells.push({ x, y });
    if (x === end.x && y === end.y) return cells;
    const doubled = 2 * error;
    if (doubled > -dy) { error -= dy; x += sx; }
    if (doubled < dx) { error += dx; y += sy; }
  }
}


// Keep the real frame untouched until pointer-up. As whole objects disappear
// from the preview, subsequent cells hit the currently visible top layer.
export function createObjectEraseStroke(matrix) {
  const occupancy = new Map();
  const removedIds = new Set();
  for (const object of matrix || []) {
    for (const cell of getAbsoluteObjectCells(object)) {
      const key = `${cell.x}:${cell.y}`;
      if (!occupancy.has(key)) occupancy.set(key, []);
      occupancy.get(key).push(object);
    }
  }
  return {
    removedIds,
    visit(cells) {
      const previousSize = removedIds.size;
      for (const cell of cells || []) {
        const remaining = (occupancy.get(`${cell.x}:${cell.y}`) || []).filter(object => !removedIds.has(object.id));
        const top = selectSimpleTopItem(remaining);
        if (top) removedIds.add(top.id);
      }
      return previousSize !== removedIds.size;
    },
  };
}
