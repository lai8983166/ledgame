export const MERGE_ERROR = Object.freeze({
  NOT_ENOUGH: "not-enough",
  MISSING_OBJECT: "missing-object",
  MIXED_COLOR: "mixed-color",
});

export function normalizeObjectColor(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.min(3, Math.max(0, Math.floor(number)));
}

export function getAbsoluteObjectCells(object) {
  const baseX = toInteger(object?.x, 0);
  const baseY = toInteger(object?.y, 0);
  return normalizePoints(object?.points).map(([dx, dy]) => ({
    x: baseX + dx,
    y: baseY + dy,
  }));
}

export function canSelectObjectForMerge(matrix, selectedIds, candidateId) {
  const objects = Array.isArray(matrix) ? matrix : [];
  const candidate = objects.find((object) => object?.id === candidateId);
  if (!candidate) {
    return { ok: false, code: MERGE_ERROR.MISSING_OBJECT };
  }
  const firstSelected = (selectedIds || [])
    .map((id) => objects.find((object) => object?.id === id))
    .find(Boolean);
  if (firstSelected && normalizeObjectColor(firstSelected.color) !== normalizeObjectColor(candidate.color)) {
    return { ok: false, code: MERGE_ERROR.MIXED_COLOR };
  }
  return { ok: true, color: normalizeObjectColor(candidate.color) };
}

export function mergeSameColorObjects(matrix, selectedIds, createId) {
  const objects = Array.isArray(matrix) ? matrix : [];
  const ids = [...new Set((selectedIds || []).filter(Boolean))];
  if (ids.length < 2) {
    return { ok: false, code: MERGE_ERROR.NOT_ENOUGH };
  }

  const selectedObjects = ids.map((id) => objects.find((object) => object?.id === id));
  if (selectedObjects.some((object) => !object)) {
    return { ok: false, code: MERGE_ERROR.MISSING_OBJECT };
  }

  const color = normalizeObjectColor(selectedObjects[0].color);
  if (selectedObjects.some((object) => normalizeObjectColor(object.color) !== color)) {
    return { ok: false, code: MERGE_ERROR.MIXED_COLOR };
  }

  const anchorX = toInteger(selectedObjects[0].x, 0);
  const anchorY = toInteger(selectedObjects[0].y, 0);
  const absoluteCells = new Map();
  selectedObjects.forEach((object) => {
    getAbsoluteObjectCells(object).forEach((cell) => {
      absoluteCells.set(`${cell.x}:${cell.y}`, cell);
    });
  });

  const points = [...absoluteCells.values()]
    .sort((left, right) => {
      const leftAnchor = left.x === anchorX && left.y === anchorY;
      const rightAnchor = right.x === anchorX && right.y === anchorY;
      if (leftAnchor !== rightAnchor) {
        return leftAnchor ? -1 : 1;
      }
      return left.y - right.y || left.x - right.x;
    })
    .map((cell) => [cell.x - anchorX, cell.y - anchorY]);

  const id = typeof createId === "function" ? createId() : String(createId || "");
  if (!id) {
    throw new Error("Merged object id is required");
  }
  const mergedObject = { id, x: anchorX, y: anchorY, color, points };
  const removeIds = new Set(ids);
  return {
    ok: true,
    object: mergedObject,
    removedIds: ids,
    matrix: [...objects.filter((object) => !removeIds.has(object?.id)), mergedObject],
  };
}

function normalizePoints(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return [[0, 0]];
  }
  const normalized = points.map((point) => Array.isArray(point)
    ? [toInteger(point[0], 0), toInteger(point[1], 0)]
    : [toInteger(point?.x, 0), toInteger(point?.y, 0)]);
  return normalized.length ? normalized : [[0, 0]];
}

function toInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}
