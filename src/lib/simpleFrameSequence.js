export function insertFrameAfter(frames, activeIndex, frame) {
  if (!Array.isArray(frames)) {
    return { inserted: false, index: -1 };
  }

  const numericIndex = Number(activeIndex);
  const index = Math.min(
    Math.max(0, Number.isFinite(numericIndex) ? numericIndex + 1 : 0),
    frames.length,
  );
  frames.splice(index, 0, frame);
  return { inserted: true, index };
}
