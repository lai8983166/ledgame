import { rasterizeSimpleFrame, SIMPLE_TICK_MS } from "./simpleLevelGif.js";

export { SIMPLE_TICK_MS };

export function normalizePreviewRepeatTimes(value) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export function createLevelPreviewState(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return null;
  }
  return { frameIndex: 0, repeatIndex: 0 };
}

export function advanceLevelPreviewState(state, frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return null;
  }
  const frameIndex = Math.min(
    frames.length - 1,
    Math.max(0, Math.floor(Number(state?.frameIndex) || 0)),
  );
  const repeats = normalizePreviewRepeatTimes(frames[frameIndex]?.repeatTimes);
  const repeatIndex = Math.min(
    repeats - 1,
    Math.max(0, Math.floor(Number(state?.repeatIndex) || 0)),
  );
  if (repeatIndex + 1 < repeats) {
    return { frameIndex, repeatIndex: repeatIndex + 1 };
  }
  return {
    frameIndex: (frameIndex + 1) % frames.length,
    repeatIndex: 0,
  };
}

export function createLevelPreviewSnapshot(level, options = {}) {
  const frames = Array.isArray(level?.frameList) ? level.frameList : [];
  return {
    label: String(level?.label ?? ""),
    frames: frames.map((frame) => ({
      repeatTimes: normalizePreviewRepeatTimes(frame?.repeatTimes),
      matrix: (Array.isArray(frame?.matrix) ? frame.matrix : []).map((object) => ({
        x: Number(object?.x) || 0,
        y: Number(object?.y) || 0,
        id: String(object?.id ?? ""),
        color: Number(object?.color) || 0,
        points: (Array.isArray(object?.points) ? object.points : [[0, 0]]).map((point) => [
          Number(point?.[0]) || 0,
          Number(point?.[1]) || 0,
        ]),
      })),
    })),
    width: Math.max(1, Math.floor(Number(options.width) || 1)),
    height: Math.max(1, Math.floor(Number(options.height) || 1)),
    colors: Array.isArray(options.colors) ? [...options.colors] : [],
  };
}

export function rasterizeLevelPreviewFrame(frame, snapshot) {
  const pixels = rasterizeSimpleFrame(frame, {
    width: snapshot?.width,
    height: snapshot?.height,
    colors: snapshot?.colors,
  });
  return new Uint8ClampedArray(pixels);
}

// The display grid belongs only to the preview; GIFs keep the original pixels.
export function drawLevelPreviewFrame(context, frame, snapshot, cellSize = 16, lineWidth = 1) {
  const width = Math.max(1, Math.floor(Number(snapshot?.width) || 1));
  const height = Math.max(1, Math.floor(Number(snapshot?.height) || 1));
  const size = Math.max(2, Math.floor(Number(cellSize) || 16));
  const border = Math.min(size - 1, Math.max(1, Math.floor(Number(lineWidth) || 1)));
  const pixels = rasterizeLevelPreviewFrame(frame, snapshot);
  const canvasWidth = width * size;
  const canvasHeight = height * size;
  context.canvas.width = canvasWidth;
  context.canvas.height = canvasHeight;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      context.fillStyle = `rgb(${pixels[offset]}, ${pixels[offset + 1]}, ${pixels[offset + 2]})`;
      context.fillRect(x * size, y * size, size, size);
    }
  }
  context.fillStyle = "#ffffff";
  for (let x = 0; x <= width; x += 1) {
    context.fillRect(Math.min(x * size, canvasWidth - border), 0, border, canvasHeight);
  }
  for (let y = 0; y <= height; y += 1) {
    context.fillRect(0, Math.min(y * size, canvasHeight - border), canvasWidth, border);
  }
}
