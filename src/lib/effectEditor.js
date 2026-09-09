/**
 * Pure helpers for the Simple/Normal/Diffcult effect editor.
 *
 * The editor deliberately expands an effect into the existing frameList/matrix
 * shape.  No runtime or backend-specific effect format is introduced here.
 */

export const EFFECT_SPRITE_NAMES = Object.freeze({
  0: Object.freeze(["\u5b89\u5168\u5757"]),
  1: Object.freeze(["\u5f97\u5206\u5757"]),
  2: Object.freeze([
    "\u9677\u9631\u5757",
    "\u9677\u9631\u57572*2",
    "\u9677\u96315*5",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "13",
    "14",
    "20",
    "15",
  ]),
  3: Object.freeze(["Double"]),
});

export const DEFAULT_EFFECT_CONFIG = Object.freeze({
  color: 0,
  startX: 1,
  startY: 1,
  endX: 1,
  endY: 1,
  width: 1,
  height: 1,
  step: 1,
  mode: "insert",
  useSprite: false,
  spriteId: "",
});

export const DEFAULT_EFFECT_MAX_FRAMES = 512;

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toInteger(value, fallback = 0) {
  return Math.trunc(toFiniteNumber(value, fallback));
}

function normalizeColor(value) {
  const number = toInteger(value, DEFAULT_EFFECT_CONFIG.color);
  return Math.min(3, Math.max(0, number));
}

function parseSpritePoints(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (_error) {
      source = [];
    }
  }
  if (!Array.isArray(source)) {
    return [];
  }
  const seen = new Set();
  const points = [];
  for (const point of source) {
    const x = Array.isArray(point) ? point[0] : point?.x;
    const y = Array.isArray(point) ? point[1] : point?.y;
    if (!Number.isInteger(Number(x)) || !Number.isInteger(Number(y))) {
      continue;
    }
    const normalized = [toInteger(x), toInteger(y)];
    const key = `${normalized[0]}:${normalized[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      points.push(normalized);
    }
  }
  return points;
}

function spriteName(sprite) {
  return String(sprite?.name ?? sprite?.id ?? "").trim();
}

function spriteColor(sprite) {
  const color = Number(sprite?.color);
  return Number.isInteger(color) ? color : -1;
}

/** Normalize a library item to the shape consumed by the effect editor. */
export function normalizeEffectSprite(sprite) {
  if (!sprite) {
    return null;
  }
  const points = parseSpritePoints(sprite.points);
  const inferredWidth = points.reduce((max, point) => Math.max(max, point[0] + 1), 1);
  const inferredHeight = points.reduce((max, point) => Math.max(max, point[1] + 1), 1);
  const width = Math.max(1, toInteger(sprite.width, inferredWidth));
  const height = Math.max(1, toInteger(sprite.height, inferredHeight));
  return {
    ...sprite,
    id: String(sprite.id ?? sprite.name ?? ""),
    name: spriteName(sprite),
    color: spriteColor(sprite),
    width,
    height,
    points,
    basic: Boolean(sprite.basic),
  };
}

/**
 * Filter and de-duplicate the library according to the requested effect color.
 * Basic entries win when the same name exists more than once.
 */
export function filterEffectSprites(spirits, color) {
  const allowed = new Set(EFFECT_SPRITE_NAMES[normalizeColor(color)] || []);
  const byName = new Map();
  for (const source of Array.isArray(spirits) ? spirits : []) {
    const sprite = normalizeEffectSprite(source);
    if (!sprite || !allowed.has(sprite.name) || sprite.color !== normalizeColor(color)) {
      continue;
    }
    const existing = byName.get(sprite.name);
    if (!existing || (!existing.basic && sprite.basic)) {
      byName.set(sprite.name, sprite);
    }
  }
  return [...byName.values()].sort((left, right) => {
    const leftIndex = EFFECT_SPRITE_NAMES[normalizeColor(color)].indexOf(left.name);
    const rightIndex = EFFECT_SPRITE_NAMES[normalizeColor(color)].indexOf(right.name);
    return leftIndex - rightIndex || left.name.localeCompare(right.name, "zh-CN");
  });
}

export function normalizeEffectConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const mode = source.mode === "merge" || source.isMerge === true ? "merge" : "insert";
  return {
    ...DEFAULT_EFFECT_CONFIG,
    ...source,
    color: normalizeColor(source.color),
    startX: toInteger(source.startX, DEFAULT_EFFECT_CONFIG.startX),
    startY: toInteger(source.startY, DEFAULT_EFFECT_CONFIG.startY),
    endX: toInteger(source.endX, DEFAULT_EFFECT_CONFIG.endX),
    endY: toInteger(source.endY, DEFAULT_EFFECT_CONFIG.endY),
    width: toInteger(source.width, DEFAULT_EFFECT_CONFIG.width),
    height: toInteger(source.height, DEFAULT_EFFECT_CONFIG.height),
    step: toFiniteNumber(source.step, DEFAULT_EFFECT_CONFIG.step),
    mode,
    useSprite: Boolean(source.useSprite),
    spriteId: String(source.spriteId ?? ""),
  };
}

function pointInBounds(x, y, width, height) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function effectExtent(config, sprite) {
  if (config.useSprite && sprite) {
    return { width: sprite.width, height: sprite.height, points: sprite.points };
  }
  return {
    width: config.width,
    height: config.height,
    points: Array.from({ length: Math.max(1, config.height) }, (_row, y) =>
      Array.from({ length: Math.max(1, config.width) }, (_column, x) => [x, y]),
    ).flat(),
  };
}

/**
 * Validate UI coordinates and the actual footprint of the generated object.
 * UI coordinates are one-based; errors expose stable field names for the form.
 */
export function validateEffectConfig(value, options = {}) {
  const config = normalizeEffectConfig(value);
  const gridWidth = Math.max(1, toInteger(options.gridWidth, 1));
  const gridHeight = Math.max(1, toInteger(options.gridHeight, 1));
  const sprite = options.sprite ? normalizeEffectSprite(options.sprite) : null;
  const sprites = filterEffectSprites(options.spirits, config.color);
  const errors = [];
  const coordinateFields = ["startX", "startY", "endX", "endY"];
  for (const field of coordinateFields) {
    const coordinate = config[field];
    const max = field.endsWith("X") ? gridWidth : gridHeight;
    if (!Number.isInteger(coordinate) || coordinate < 1 || coordinate > max) {
      errors.push({ field, code: "COORDINATE_OUT_OF_RANGE" });
    }
  }
  if (!Number.isFinite(config.step) || config.step <= 0) {
    errors.push({ field: "step", code: "STEP_INVALID" });
  }
  if (!Number.isInteger(config.width) || config.width < 1) {
    errors.push({ field: "width", code: "DIMENSION_INVALID" });
  }
  if (!Number.isInteger(config.height) || config.height < 1) {
    errors.push({ field: "height", code: "DIMENSION_INVALID" });
  }
  if (config.mode !== "insert" && config.mode !== "merge") {
    errors.push({ field: "mode", code: "MODE_INVALID" });
  }
  if (config.useSprite) {
    if (!sprites.length) {
      errors.push({ field: "spriteId", code: "SPRITE_UNAVAILABLE" });
    } else if (!sprite || !sprites.some((candidate) => candidate.id === sprite.id)) {
      errors.push({ field: "spriteId", code: "SPRITE_REQUIRED" });
    } else if (!sprite.points.length) {
      errors.push({ field: "spriteId", code: "SPRITE_EMPTY" });
    }
  }
  if (errors.length) {
    return errors;
  }
  const positions = sampleEffectTrajectory(config, { maxFrames: options.maxFrames });
  const extent = effectExtent(config, sprite);
  const invalidPoint = extent.points.find(([x, y]) =>
    !pointInBounds(x, y, extent.width, extent.height),
  );
  if (invalidPoint) {
    errors.push({ field: "spriteId", code: "SPRITE_POINTS_OUT_OF_BOUNDS" });
  }
  for (const position of positions) {
    if (
      position.x < 0 ||
      position.y < 0 ||
      position.x + extent.width > gridWidth ||
      position.y + extent.height > gridHeight
    ) {
      errors.push({ field: config.useSprite ? "spriteId" : "width", code: "FOOTPRINT_OUT_OF_RANGE" });
      break;
    }
  }
  return errors;
}

/**
 * Sample a deterministic straight-line trajectory.  The endpoint is always
 * included; sub-unit steps are bounded to avoid an unbounded preview.
 */
export function sampleEffectTrajectory(value, options = {}) {
  const config = normalizeEffectConfig(value);
  const maxFrames = Math.max(1, toInteger(options.maxFrames, DEFAULT_EFFECT_MAX_FRAMES));
  const start = { x: config.startX - 1, y: config.startY - 1 };
  const end = { x: config.endX - 1, y: config.endY - 1 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const span = Math.max(Math.abs(dx), Math.abs(dy));
  if (!span) {
    return [start];
  }
  const step = Number.isFinite(config.step) && config.step > 0 ? config.step : 1;
  const segments = Math.max(1, Math.ceil(span / step));
  const frameCount = Math.min(maxFrames, segments + 1);
  const positions = [];
  for (let index = 0; index < frameCount; index += 1) {
    const ratio = frameCount === 1 ? 1 : index / (frameCount - 1);
    const position = {
      x: Math.round(start.x + dx * ratio),
      y: Math.round(start.y + dy * ratio),
    };
    // Keep repeated rounded positions when step < 1.  They are real effect
    // frames, and the max-frame guard above is what prevents an unbounded run.
    positions.push(position);
  }
  const last = positions.at(-1);
  if (!last || last.x !== end.x || last.y !== end.y) {
    positions.push(end);
  }
  return positions.slice(0, maxFrames);
}

function makeObjectId(prefix, index) {
  return `${prefix || "effect"}-${index}`;
}

function normalizeEffectPoints(config, sprite) {
  if (config.useSprite && sprite) {
    return sprite.points.map(([x, y]) => [x, y]);
  }
  const points = [];
  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      points.push([x, y]);
    }
  }
  return points;
}

/** Expand a config into ordinary matrix objects for each sampled position. */
export function expandEffectFrames(value, options = {}) {
  const config = normalizeEffectConfig(value);
  const sprites = filterEffectSprites(options.spirits, config.color);
  const sprite = config.useSprite
    ? sprites.find((candidate) => candidate.id === config.spriteId) || sprites[0] || null
    : null;
  const positions = sampleEffectTrajectory(config, options);
  const points = normalizeEffectPoints(config, sprite);
  const prefix = options.idPrefix || "effect";
  const spriteMode = Boolean(config.useSprite && sprite);
  return positions.map((position) => ({
    repeatTimes: 1,
    matrix: spriteMode
      ? [{
        id: makeObjectId(prefix, 0),
        x: position.x,
        y: position.y,
        color: config.color,
        points: points.map((point) => [...point]),
      }]
      : points.map((point, index) => ({
        id: makeObjectId(prefix, index),
        x: position.x + point[0],
        y: position.y + point[1],
        color: config.color,
        points: [[0, 0]],
      })),
  }));
}

function cloneFrame(frame) {
  return {
    ...frame,
    matrix: Array.isArray(frame?.matrix)
      ? frame.matrix.map((object) => ({
        ...object,
        points: Array.isArray(object.points) ? object.points.map((point) => [...point]) : [[0, 0]],
      }))
      : [],
  };
}

/** Apply generated frames to a level's existing frameList without mutating input. */
export function applyEffectToFrameList(frameList, currentIndex, generatedFrames, mode = "insert") {
  const source = Array.isArray(frameList) ? frameList : [];
  const generated = Array.isArray(generatedFrames) ? generatedFrames.map(cloneFrame) : [];
  if (!generated.length) {
    return { frameList: source.map(cloneFrame), selectedFrameIndex: Math.max(0, toInteger(currentIndex)) };
  }
  const index = Math.min(source.length, Math.max(0, toInteger(currentIndex)));
  if (mode === "merge") {
    const next = source.map(cloneFrame);
    while (next.length < index + generated.length) {
      next.push({ repeatTimes: 1, matrix: [] });
    }
    generated.forEach((frame, offset) => {
      const target = next[index + offset];
      target.matrix = [...(target.matrix || []), ...(frame.matrix || []).map((object) => ({
        ...object,
        points: object.points.map((point) => [...point]),
      }))];
    });
    return { frameList: next, selectedFrameIndex: index + generated.length - 1 };
  }
  const next = source.map(cloneFrame);
  next.splice(index, 0, ...generated);
  return { frameList: next, selectedFrameIndex: index + generated.length - 1 };
}

export function resolveEffectSprite(spirits, config) {
  const normalized = normalizeEffectConfig(config);
  return filterEffectSprites(spirits, normalized.color)
    .find((sprite) => sprite.id === normalized.spriteId) || null;
}
