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
