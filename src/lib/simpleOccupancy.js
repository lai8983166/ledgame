import { getAbsoluteObjectCells, normalizeObjectColor } from './simpleObjectMerge.js';

export function resolveLiveOccupancyCell(index, key, selectTop) {
  const occupants = index?.get(key) || [];
  const topEntry = selectTop(occupants);
  return topEntry ? { ...topEntry, occupants } : undefined;
}

function colorOccupancy(matrix) {
  const counts = new Map();
  for (const object of matrix || []) {
    const color = normalizeObjectColor(object.color);
    for (const { x, y } of getAbsoluteObjectCells(object)) {
      const key = `${x}:${y}:${color}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

// Existing overlaps are readable/repairable; an edit cannot increase or move them.
export function canApplyColorOccupancy(before, after) {
  const previous = colorOccupancy(before);
  for (const [key, count] of colorOccupancy(after)) {
    if (count > Math.max(1, previous.get(key) || 0)) return false;
  }
  return true;
}

export function filterUnoccupiedColorCells(matrix, cells, color) {
  const occupied = colorOccupancy(matrix);
  const seen = new Set(), result = [];
  for (const cell of cells || []) {
    const key = `${cell.x}:${cell.y}:${normalizeObjectColor(color)}`;
    if (occupied.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push({ x: cell.x, y: cell.y });
  }
  return result;
}
