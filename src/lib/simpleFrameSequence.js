export function visibleFrameIndices(frameCount, currentIndex) {
  const count = Math.max(0, Math.trunc(Number(frameCount) || 0));
  if (!count) return [];
  const slots = Math.min(count, 12);
  const indices = new Set();
  for (let index = 0; index < slots; index++) {
    indices.add(slots === 1 ? 0 : Math.round(index * (count - 1) / (slots - 1)));
  }
  indices.add(Math.min(count - 1, Math.max(0, Math.trunc(Number(currentIndex) || 0))));
  return [...indices].sort((left, right) => left - right);
}

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
