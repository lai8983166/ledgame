// Pure logic for ELC-408 wiring canvas state. No Vue, no DOM, no IPC.
// All ordering, allocation, deletion and renumbering lives here so it can be
// unit tested without rendering anything.

export const WIRING_MODES = [
  "SINGLE_ROW_PRIORITY",
  "SINGLE_COL_PRIORITY",
  "TURN_BACK_ROW_PRIORITY",
  "TURN_BACK_COL_PRIORITY",
];

export const DEFAULT_FRAME_WIDTH = 16;
export const DEFAULT_FRAME_HEIGHT = 32;
export const DEFAULT_MAX_POINTS_PER_CHANNEL = 64;
export const PROTOCOL_MAX_POINTS_PER_CHANNEL = 170;

export function createWiringDocument({
  width = DEFAULT_FRAME_WIDTH,
  height = DEFAULT_FRAME_HEIGHT,
  maxPointsPerChannel = DEFAULT_MAX_POINTS_PER_CHANNEL,
  mode = "SINGLE_ROW_PRIORITY",
} = {}) {
  return {
    width: clampPositiveInt(width, DEFAULT_FRAME_WIDTH),
    height: clampPositiveInt(height, DEFAULT_FRAME_HEIGHT),
    maxPointsPerChannel: clampPositiveInt(
      maxPointsPerChannel,
      DEFAULT_MAX_POINTS_PER_CHANNEL,
      PROTOCOL_MAX_POINTS_PER_CHANNEL,
    ),
    mode: WIRING_MODES.includes(mode) ? mode : "SINGLE_ROW_PRIORITY",
    lines: [[]],
    activeChannelIndex: 0,
  };
}

export function getActiveChannel(document) {
  const index = clampChannelIndex(document, document.activeChannelIndex);
  return { index, points: document.lines[index] || [] };
}

export function setActiveChannel(document, channelIndex) {
  const index = clampChannelIndex(document, channelIndex);
  return { ...document, activeChannelIndex: index };
}

export function getOccupancy(document) {
  const occupancy = new Map();
  document.lines.forEach((line, lineIndex) => {
    (line || []).forEach((point, pixelIndex) => {
      if (Array.isArray(point) && point.length === 2) {
        occupancy.set(pointKey(point[0], point[1]), { lineIndex, pixelIndex });
      }
    });
  });
  return occupancy;
}

export function findPoint(document, x, y) {
  const occupancy = getOccupancy(document);
  return occupancy.get(pointKey(x, y)) || null;
}

export function resizeFrame(document, { width, height }) {
  const nextWidth = clampPositiveInt(width, DEFAULT_FRAME_WIDTH);
  const nextHeight = clampPositiveInt(height, DEFAULT_FRAME_HEIGHT);
  const outOfBounds = [];
  document.lines.forEach((line, lineIndex) => {
    (line || []).forEach((point, pixelIndex) => {
      if (Array.isArray(point) && point.length === 2) {
        const [x, y] = point;
        if (x < 0 || x >= nextWidth || y < 0 || y >= nextHeight) {
          outOfBounds.push({ lineIndex, pixelIndex, x, y });
        }
      }
    });
  });
  if (outOfBounds.length > 0) {
    return {
      ok: false,
      error: "OUT_OF_BOUNDS_POINTS",
      outOfBounds,
      document,
    };
  }
  return {
    ok: true,
    document: { ...document, width: nextWidth, height: nextHeight },
  };
}

export function setMaxPointsPerChannel(document, maxPointsPerChannel) {
  const next = clampPositiveInt(
    maxPointsPerChannel,
    DEFAULT_MAX_POINTS_PER_CHANNEL,
    PROTOCOL_MAX_POINTS_PER_CHANNEL,
  );
  const overLimit = [];
  document.lines.forEach((line, lineIndex) => {
    if (line && line.length > next) {
      overLimit.push({ lineIndex, currentCount: line.length, max: next });
    }
  });
  if (overLimit.length > 0) {
    return {
      ok: false,
      error: "EXISTING_LINE_EXCEEDS_MAX",
      overLimit,
      document,
    };
  }
  return {
    ok: true,
    document: { ...document, maxPointsPerChannel: next },
  };
}

export function setMode(document, mode) {
  if (!WIRING_MODES.includes(mode)) {
    return { ok: false, error: "UNKNOWN_MODE", document };
  }
  return { ok: true, document: { ...document, mode } };
}

// -- Append operations -------------------------------------------------------

/**
 * Append a single unoccupied point to the active channel. If the channel is
 * full, spill into the next channel (creating a new line if needed).
 */
export function appendPoint(document, x, y) {
  if (!isInBounds(document, x, y)) {
    return { ok: false, error: "OUT_OF_BOUNDS", document };
  }
  if (findPoint(document, x, y)) {
    return { ok: false, error: "ALREADY_OCCUPIED", document };
  }
  const lines = document.lines.map((line) => (line ? [...line] : []));
  let activeIndex = clampChannelIndex(document, document.activeChannelIndex);
  if (!lines[activeIndex]) {
    lines[activeIndex] = [];
  }
  while (lines[activeIndex].length >= document.maxPointsPerChannel) {
    activeIndex += 1;
    if (!lines[activeIndex]) {
      lines[activeIndex] = [];
    }
  }
  lines[activeIndex].push([x, y]);
  return {
    ok: true,
    document: { ...document, lines, activeChannelIndex: activeIndex },
  };
}

/**
 * Append all unoccupied points inside a rectangle (filtered first), then
 * sorted by the current mode. Points are appended to the active channel,
 * spilling to the next channel when full.
 */
export function appendRectangle(document, startX, startY, endX, endY) {
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);
  const candidates = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (isInBounds(document, x, y) && !findPoint(document, x, y)) {
        candidates.push([x, y]);
      }
    }
  }
  const ordered = orderCandidates(document.mode, candidates, {
    minX,
    maxX,
    minY,
    maxY,
  });
  let working = document;
  for (const [x, y] of ordered) {
    const result = appendPoint(working, x, y);
    if (result.ok) {
      working = result.document;
    }
  }
  return { ok: true, document: working };
}

// -- Delete operations -------------------------------------------------------

export function deletePoint(document, x, y) {
  const found = findPoint(document, x, y);
  if (!found) {
    return { ok: false, error: "NOT_FOUND", document };
  }
  const lines = document.lines.map((line, idx) => {
    if (idx !== found.lineIndex) {
      return line ? [...line] : [];
    }
    return line.filter((_, index) => index !== found.pixelIndex);
  });
  // Empty lines remain as placeholders - do NOT remove them.
  return {
    ok: true,
    document: { ...document, lines },
  };
}

export function deleteRectangle(document, startX, startY, endX, endY) {
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);
  const toDelete = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const found = findPoint(document, x, y);
      if (found) {
        toDelete.push(`${x}:${y}`);
      }
    }
  }
  const lines = document.lines.map((line) => {
    if (!line) {
      return [];
    }
    return line.filter(([px, py]) => !toDelete.includes(`${px}:${py}`));
  });
  return { ok: true, document: { ...document, lines } };
}

// -- Ordering ---------------------------------------------------------------

/**
 * Pure ordering function. Takes the candidates array and returns a new array
 * sorted by the current wiring mode. Implementations deliberately reject
 * occupied points (callers must filter before calling).
 */
export function orderCandidates(mode, candidates) {
  if (!Array.isArray(candidates)) {
    return [];
  }
  switch (mode) {
    case "SINGLE_ROW_PRIORITY":
      return [...candidates].sort(byRowThenCol);
    case "SINGLE_COL_PRIORITY":
      return [...candidates].sort(byColThenRow);
    case "TURN_BACK_ROW_PRIORITY":
      return [...candidates].sort(byRowTurnBack);
    case "TURN_BACK_COL_PRIORITY":
      return [...candidates].sort(byColTurnBack);
    default:
      return [...candidates].sort(byRowThenCol);
  }
}

function byRowThenCol(a, b) {
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[0] - b[0];
}

function byColThenRow(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

function byRowTurnBack(a, b) {
  if (a[1] !== b[1]) return a[1] - b[1];
  if (a[1] % 2 === 0) {
    return a[0] - b[0];
  }
  return b[0] - a[0];
}

function byColTurnBack(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[0] % 2 === 0) {
    return a[1] - b[1];
  }
  return b[1] - a[1];
}

// -- For-download shape -----------------------------------------------------

export function toDownloadPayload(document) {
  return {
    width: document.width,
    height: document.height,
    maxPointsPerChannel: document.maxPointsPerChannel,
    lines: document.lines.map((line) =>
      (line || []).map((point) => {
        if (!Array.isArray(point) || point.length !== 2) {
          return [0, 0];
        }
        return [Number(point[0]), Number(point[1])];
      }),
    ),
  };
}

export function summarizeChannels(document) {
  return document.lines.map((line, index) => ({
    index,
    pointCount: line ? line.length : 0,
  }));
}

// -- Helpers ----------------------------------------------------------------

function clampPositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  const int = Math.floor(n);
  if (!Number.isInteger(int)) {
    return fallback;
  }
  if (max && int > max) {
    return max;
  }
  return int;
}

function clampChannelIndex(document, channelIndex) {
  const total = document.lines.length;
  if (!Number.isFinite(channelIndex) || channelIndex < 0) {
    return 0;
  }
  if (channelIndex >= total) {
    return Math.max(0, total - 1);
  }
  return Math.floor(channelIndex);
}

function isInBounds(document, x, y) {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < document.width &&
    y >= 0 &&
    y < document.height
  );
}

function pointKey(x, y) {
  return `${x}:${y}`;
}
