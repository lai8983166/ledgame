export const SIMPLE_TICK_MS = 25;

export function selectSimpleTopItem(items, colorOf = (item) => item?.color) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (Number(colorOf(items[index])) === 0) {
      return items[index];
    }
  }
  return items[items.length - 1];
}

export function simpleFrameDelayMs(repeatTimes) {
  const repeats = Math.max(1, Math.floor(Number(repeatTimes) || 1));
  return Math.max(10, Math.round((repeats * SIMPLE_TICK_MS) / 10) * 10);
}

export function normalizeRgbColor(value, fallback = "#000000") {
  const color = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

export function rasterizeSimpleFrame(frame, options) {
  const width = clampDimension(options?.width);
  const height = clampDimension(options?.height);
  const palette = normalizeGamePalette(options?.colors);
  const occupants = Array.from({ length: width * height }, () => []);

  for (const rawObject of frame?.matrix || []) {
    const object = normalizeObject(rawObject);
    for (const [dx, dy] of object.points) {
      const x = object.x + dx;
      const y = object.y + dy;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        occupants[y * width + x].push(object);
      }
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < occupants.length; index += 1) {
    const object = selectSimpleTopItem(occupants[index]);
    const color = object ? palette[clampColorIndex(object.color)] : palette[4];
    const offset = index * 4;
    rgba[offset] = color[0];
    rgba[offset + 1] = color[1];
    rgba[offset + 2] = color[2];
    rgba[offset + 3] = 255;
  }
  return rgba;
}

export function prepareSimpleLevelGif(level, document) {
  const width = clampDimension(document?.siteSizeWidth);
  const height = clampDimension(document?.siteSizeHeight);
  const colors = [document?.color0, document?.color1, document?.color2, document?.color3];
  const palette = uniquePalette(normalizeGamePalette(colors));
  const frames = (level?.frameList || []).map((frame) => ({
    pixels: rasterizeSimpleFrame(frame, { width, height, colors }),
    delay: simpleFrameDelayMs(frame?.repeatTimes),
  }));
  return { width, height, palette, frames };
}

function normalizeGamePalette(colors) {
  const defaults = ["#00ff00", "#0000ff", "#ff00ff", "#ffffff"];
  const values = Array.isArray(colors) ? colors : [];
  return defaults.map((fallback, index) => normalizeRgbColor(values[index], fallback)).concat([[0, 0, 0]]);
}

function uniquePalette(colors) {
  const unique = new Map();
  for (const color of colors) {
    unique.set(color.join(":"), color);
  }
  return [...unique.values()];
}

function normalizeObject(value) {
  const object = Array.isArray(value)
    ? value.length >= 4
      ? { x: value[0], y: value[1], color: value[3]?.color, points: value[3]?.points }
      : { x: value[0], y: value[1], color: value[2], points: [[0, 0]] }
    : value || {};
  return {
    x: toInteger(object.x),
    y: toInteger(object.y),
    color: clampColorIndex(object.color),
    points: normalizePoints(object.points),
  };
}

function normalizePoints(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return [[0, 0]];
  }
  const normalized = points.map((point) =>
    Array.isArray(point)
      ? [toInteger(point[0]), toInteger(point[1])]
      : [toInteger(point?.x), toInteger(point?.y)],
  );
  return normalized.length ? normalized : [[0, 0]];
}

function clampDimension(value) {
  const number = Number(value);
  return Math.min(96, Math.max(1, Number.isFinite(number) ? Math.floor(number) : 1));
}

function clampColorIndex(value) {
  const number = Number(value);
  return Math.min(3, Math.max(0, Number.isFinite(number) ? Math.floor(number) : 0));
}

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}
