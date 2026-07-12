export const MAX_SPIRIT_DIMENSION = 96;

export function clampSpiritDimension(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 1;
  }
  return Math.min(MAX_SPIRIT_DIMENSION, Math.max(1, Math.floor(number)));
}

export function parseSpiritPoints(value) {
  let points = value;
  if (typeof value === "string") {
    try {
      points = JSON.parse(value);
    } catch (_error) {
      return [];
    }
  }
  if (!Array.isArray(points)) {
    return [];
  }
  const unique = new Map();
  for (const point of points) {
    if (!Array.isArray(point) || point.length < 2) {
      continue;
    }
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (Number.isInteger(x) && Number.isInteger(y)) {
      unique.set(`${x}:${y}`, [x, y]);
    }
  }
  return [...unique.values()];
}

export function cropSpiritPoints(points, width, height) {
  const safeWidth = clampSpiritDimension(width);
  const safeHeight = clampSpiritDimension(height);
  return parseSpiritPoints(points)
    .filter(([x, y]) => x >= 0 && x < safeWidth && y >= 0 && y < safeHeight)
    .sort(([leftX, leftY], [rightX, rightY]) => leftY - rightY || leftX - rightX);
}

export function createSpiritUpdatePayload(width, height, points) {
  const safeWidth = clampSpiritDimension(width);
  const safeHeight = clampSpiritDimension(height);
  return {
    width: safeWidth,
    height: safeHeight,
    points: cropSpiritPoints(points, safeWidth, safeHeight),
  };
}

export function createSpiritCreatePayload(name, width, height, points) {
  return {
    name: String(name || "").trim(),
    ...createSpiritUpdatePayload(width, height, points),
  };
}
