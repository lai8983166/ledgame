// Pure helpers for the per-game symbol-light/circle-light layout editor.
// UI values are one-based for controllers and ports; persisted values are zero-based.

export const PIXEL_LIGHT_WALLS = Object.freeze([
  { wall: 0, key: "top", formKey: "topWallPixelLightNum" },
  { wall: 1, key: "right", formKey: "rightWallPixelLightNum" },
  { wall: 2, key: "bottom", formKey: "bottomWallPixelLightNum" },
  { wall: 3, key: "left", formKey: "leftWallPixelLightNum" },
]);

export const PIXEL_LIGHT_CHANNEL_COUNT = 8;
export const PIXEL_LIGHT_WALL_COLORS = Object.freeze({
  0: "#ff2b2b",
  1: "#35e23d",
  2: "#244cff",
  3: "#ff23e9",
});
export const PIXEL_LIGHT_DEFAULTS = Object.freeze({
  selectedRow: "0|0",
  form: Object.freeze({
    open: 0,
    controlIdx: 0,
    pixelPort: 6,
    circlePort: 7,
    order: 1,
    forceAlign: 0,
    topWallPixelLightNum: 0,
    rightWallPixelLightNum: 0,
    bottomWallPixelLightNum: 0,
    leftWallPixelLightNum: 0,
  }),
  rows: Object.freeze([]),
});

function integerOr(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function cloneRow(row) {
  return {
    wall: integerOr(row?.wall, 0, { min: 0, max: 3 }),
    idx: integerOr(row?.idx, 0, { min: 0 }),
    align: typeof row?.align === "string" ? row.align : "",
  };
}

export function pixelLightRowKey(rowOrWall, index) {
  if (typeof rowOrWall === "object" && rowOrWall !== null) {
    return `${integerOr(rowOrWall.wall, 0, { min: 0, max: 3 })}|${integerOr(rowOrWall.idx, 0, { min: 0 })}`;
  }
  return `${integerOr(rowOrWall, 0, { min: 0, max: 3 })}|${integerOr(index, 0, { min: 0 })}`;
}

export function getPixelLightWallCount(form, wall) {
  const descriptor = PIXEL_LIGHT_WALLS.find((entry) => entry.wall === wall);
  return descriptor ? integerOr(form?.[descriptor.formKey], 0, { min: 0 }) : 0;
}

export function rebuildPixelLightRows(form, previousRows = []) {
  const previousByKey = new Map();
  for (const row of Array.isArray(previousRows) ? previousRows : []) {
    const normalized = cloneRow(row);
    previousByKey.set(pixelLightRowKey(normalized), normalized);
  }

  const rows = [];
  for (const descriptor of PIXEL_LIGHT_WALLS) {
    const count = getPixelLightWallCount(form, descriptor.wall);
    for (let idx = 0; idx < count; idx += 1) {
      const key = pixelLightRowKey(descriptor.wall, idx);
      rows.push({
        wall: descriptor.wall,
        idx,
        align: previousByKey.get(key)?.align || "",
      });
    }
  }
  return rows;
}

export function normalizePixelLightWiring(source, options = {}) {
  const input = source && typeof source === "object" ? source : {};
  const sourceForm = input.form && typeof input.form === "object" ? input.form : {};
  const form = {};
  for (const [key, fallback] of Object.entries(PIXEL_LIGHT_DEFAULTS.form)) {
    const min = key.endsWith("Num") || key === "controlIdx" || key === "pixelPort" || key === "circlePort" ? 0 : 0;
    const max = key === "pixelPort" || key === "circlePort" ? PIXEL_LIGHT_CHANNEL_COUNT - 1 : Number.MAX_SAFE_INTEGER;
    form[key] = integerOr(sourceForm[key], fallback, { min, max });
  }
  form.open = form.open ? 1 : 0;
  form.forceAlign = form.forceAlign ? 1 : 0;
  form.order = form.order ? 1 : 0;

  const rows = rebuildPixelLightRows(form, input.rows);
  const selectedRow = typeof input.selectedRow === "string" && /^\d+\|\d+$/.test(input.selectedRow)
    ? input.selectedRow
    : PIXEL_LIGHT_DEFAULTS.selectedRow;

  const normalized = {
    selectedRow,
    form,
    rows,
  };
  if (options.rebuildRows === false) {
    normalized.rows = (Array.isArray(input.rows) ? input.rows : []).map(cloneRow);
  }
  return normalized;
}

export function updatePixelLightWallCount(layout, wall, count) {
  const normalized = normalizePixelLightWiring(layout);
  const descriptor = PIXEL_LIGHT_WALLS.find((entry) => entry.wall === Number(wall));
  if (!descriptor) {
    return normalized;
  }
  normalized.form[descriptor.formKey] = integerOr(count, 0, { min: 0 });
  normalized.rows = rebuildPixelLightRows(normalized.form, normalized.rows);
  if (!normalized.rows.some((row) => pixelLightRowKey(row) === normalized.selectedRow)) {
    normalized.selectedRow = firstPixelLightRow(normalized.rows) || PIXEL_LIGHT_DEFAULTS.selectedRow;
  }
  return normalized;
}

export function setPixelLightRowAlign(layout, wall, idx, align) {
  const normalized = normalizePixelLightWiring(layout);
  const key = pixelLightRowKey(wall, idx);
  const row = normalized.rows.find((entry) => pixelLightRowKey(entry) === key);
  if (row) {
    row.align = typeof align === "string" ? align : "";
  }
  return normalized;
}

export function selectPixelLightRow(layout, wall, idx) {
  const normalized = normalizePixelLightWiring(layout);
  const key = pixelLightRowKey(wall, idx);
  if (normalized.rows.some((row) => pixelLightRowKey(row) === key && row.idx === 0)) {
    normalized.selectedRow = key;
  }
  return normalized;
}

export function firstPixelLightRow(rows) {
  return (Array.isArray(rows) ? rows : []).map(pixelLightRowKey)[0] || "";
}

export function validatePixelLightWiring(layout, options = {}) {
  const normalized = normalizePixelLightWiring(layout);
  const errors = [];
  const controllerCount = Number.isInteger(options.controllerCount) && options.controllerCount > 0
    ? options.controllerCount
    : null;

  if (controllerCount !== null && normalized.form.controlIdx >= controllerCount) {
    errors.push({ field: "controlIdx", code: "CONTROLLER_OUT_OF_RANGE" });
  }
  for (const field of ["pixelPort", "circlePort"]) {
    if (normalized.form[field] < 0 || normalized.form[field] >= PIXEL_LIGHT_CHANNEL_COUNT) {
      errors.push({ field, code: "CHANNEL_OUT_OF_RANGE" });
    }
  }
  if (normalized.form.open && normalized.form.pixelPort === normalized.form.circlePort) {
    errors.push({ field: "circlePort", code: "CHANNEL_CONFLICT" });
  }

  const rowKeys = new Set();
  for (const row of normalized.rows) {
    const key = pixelLightRowKey(row);
    if (rowKeys.has(key)) {
      errors.push({ field: `rows.${key}`, code: "DUPLICATE_ROW" });
    }
    rowKeys.add(key);
    if (row.idx < 0 || row.wall < 0 || row.wall > 3) {
      errors.push({ field: `rows.${key}`, code: "ROW_OUT_OF_RANGE" });
    }
    if (row.align) {
      const alignError = validatePixelLightAlign(row.align, options.gridWidth, options.gridHeight);
      if (alignError) {
        errors.push({ field: `rows.${key}.align`, ...alignError });
      }
    }
    if (normalized.form.forceAlign && !row.align) {
      errors.push({ field: `rows.${key}.align`, code: "ALIGN_REQUIRED" });
    }
  }

  if (normalized.form.open && normalized.selectedRow && !/^\d+\|0$/.test(normalized.selectedRow)) {
    errors.push({ field: "selectedRow", code: "START_MUST_BE_FIRST" });
  } else if (normalized.form.open && normalized.selectedRow && !rowKeys.has(normalized.selectedRow)) {
    errors.push({ field: "selectedRow", code: "START_ROW_MISSING" });
  }
  return errors;
}

export function buildPixelLightPreview(layout, width, height) {
  const normalized = normalizePixelLightWiring(layout);
  const safeWidth = integerOr(width, 16, { min: 1, max: 256 });
  const safeHeight = integerOr(height, 16, { min: 1, max: 256 });
  const cellSize = Math.max(5, Math.min(14, Math.floor(360 / safeHeight)));
  const floor = {
    x: 82,
    y: 82,
    width: safeWidth * cellSize,
    height: safeHeight * cellSize,
  };
  const wallGap = Math.max(14, Math.round(cellSize * 2));
  const sideWallWidth = Math.max(48, Math.round(cellSize * 5.2));
  const topWallHeight = Math.max(48, Math.round(cellSize * 5.2));
  const outer = Math.max(16, Math.round(cellSize * 1.8));
  const walls = [
    {
      wall: 0,
      key: "top",
      x: floor.x,
      y: outer,
      width: floor.width,
      height: topWallHeight,
      color: PIXEL_LIGHT_WALL_COLORS[0],
    },
    {
      wall: 1,
      key: "right",
      x: floor.x + floor.width + wallGap,
      y: floor.y,
      width: sideWallWidth,
      height: floor.height,
      color: PIXEL_LIGHT_WALL_COLORS[1],
    },
    {
      wall: 2,
      key: "bottom",
      x: floor.x,
      y: floor.y + floor.height + wallGap,
      width: floor.width,
      height: topWallHeight,
      color: PIXEL_LIGHT_WALL_COLORS[2],
    },
    {
      wall: 3,
      key: "left",
      x: outer,
      y: floor.y,
      width: sideWallWidth,
      height: floor.height,
      color: PIXEL_LIGHT_WALL_COLORS[3],
    },
  ];

  const wallById = new Map(walls.map((wall) => [wall.wall, wall]));
  const lights = normalized.rows.map((row) => {
    const wall = wallById.get(row.wall) || walls[0];
    const align = parseAlign(row.align);
    const count = getPixelLightWallCount(normalized.form, row.wall);
    const progress = count > 1 ? row.idx / (count - 1) : 0.5;
    const symbolInset = Math.max(7, Math.round(cellSize * 1.05));
    const circleInset = Math.max(7, Math.round(cellSize * 1.05));
    let centerX = wall.x + wall.width / 2;
    let centerY = wall.y + wall.height / 2;
    if (row.wall === 0) {
      centerX = wall.x + progress * wall.width;
    } else if (row.wall === 2) {
      centerX = wall.x + (1 - progress) * wall.width;
    } else if (row.wall === 1) {
      centerY = wall.y + progress * wall.height;
    } else {
      centerY = wall.y + (1 - progress) * wall.height;
    }

    const symbol = { x: centerX, y: centerY };
    const circle = { x: centerX, y: centerY };
    if (row.wall === 0) {
      symbol.y -= symbolInset;
      circle.y += circleInset;
    } else if (row.wall === 1) {
      symbol.x += symbolInset;
      circle.x -= circleInset;
    } else if (row.wall === 2) {
      symbol.x = centerX;
      symbol.y += symbolInset;
      circle.y -= circleInset;
    } else {
      symbol.x -= symbolInset;
      circle.x += circleInset;
    }

    // `align` is a zero-based floor coordinate. When supplied, both lights
    // belonging to the row are placed on that tile instead of their default
    // wall position, so the editor preview makes the alignment explicit.
    if (align) {
      const anchor = {
        x: floor.x + (align.x + 0.5) * cellSize,
        y: floor.y + (align.y + 0.5) * cellSize,
      };
      const pairOffset = Math.max(2, Math.round(cellSize * 0.22));
      symbol.x = anchor.x - pairOffset;
      symbol.y = anchor.y - pairOffset;
      circle.x = anchor.x + pairOffset;
      circle.y = anchor.y + pairOffset;
    }

    return {
      key: pixelLightRowKey(row),
      wall: row.wall,
      idx: row.idx,
      align,
      // Keep the original floor-local coordinates for callers that use them as
      // alignment data, while the visual renderer uses wall positions below.
      x: align ? Math.min(safeWidth - 1, align.x) : progress * Math.max(0, safeWidth - 1),
      y: align ? Math.min(safeHeight - 1, align.y) : progress * Math.max(0, safeHeight - 1),
      symbol,
      circle,
      selected: normalized.selectedRow === pixelLightRowKey(row),
    };
  });

  const lightsByKey = new Map(lights.map((light) => [light.key, light]));
  const clockwiseKeys = normalized.rows.map(pixelLightRowKey);
  const chainKeys = normalized.form.order
    ? clockwiseKeys
    : [...clockwiseKeys].reverse();
  const startIndex = chainKeys.indexOf(normalized.selectedRow);
  const rotatedKeys = startIndex >= 0
    ? [...chainKeys.slice(startIndex), ...chainKeys.slice(0, startIndex)]
    : chainKeys;
  const symbolChain = rotatedKeys.map((key) => lightsByKey.get(key)?.symbol).filter(Boolean);
  const circleChain = rotatedKeys.map((key) => lightsByKey.get(key)?.circle).filter(Boolean);
  const canvasWidth = floor.x + floor.width + wallGap + sideWallWidth + outer;
  const canvasHeight = floor.y + floor.height + wallGap + topWallHeight + outer;

  return {
    width: safeWidth,
    height: safeHeight,
    cellSize,
    canvasWidth,
    canvasHeight,
    floor,
    walls,
    lights,
    symbolChain,
    circleChain,
  };
}

export function parseAlign(value) {
  if (typeof value !== "string" || !/^\d+,\d+$/.test(value)) {
    return null;
  }
  const [x, y] = value.split(",").map(Number);
  return { x, y };
}

export function validatePixelLightAlign(value, width, height) {
  const align = parseAlign(value);
  if (!align) {
    return { code: "INVALID_ALIGN" };
  }
  const safeWidth = integerOr(width, 16, { min: 1, max: 256 });
  const safeHeight = integerOr(height, 16, { min: 1, max: 256 });
  if (align.x >= safeWidth || align.y >= safeHeight) {
    return { code: "ALIGN_OUT_OF_RANGE", width: safeWidth, height: safeHeight };
  }
  return null;
}
