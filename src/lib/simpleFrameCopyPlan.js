export function createWholeFrameCopyPlan(mode, currentIndex, frameCount) {
  const count = Math.max(0, Math.floor(Number(frameCount) || 0));
  const sourceIndex = Math.floor(Number(currentIndex) || 0);
  if (sourceIndex < 0 || sourceIndex >= count) {
    return { targetIndices: [], overwriteIndices: [], createIndex: null };
  }

  if (mode === "previous") {
    const targetIndex = sourceIndex - 1;
    return targetIndex >= 0
      ? { targetIndices: [targetIndex], overwriteIndices: [targetIndex], createIndex: null }
      : { targetIndices: [], overwriteIndices: [], createIndex: null };
  }

  if (mode === "next") {
    const targetIndex = sourceIndex + 1;
    if (targetIndex < count) {
      return { targetIndices: [targetIndex], overwriteIndices: [targetIndex], createIndex: null };
    }
    return { targetIndices: [targetIndex], overwriteIndices: [], createIndex: targetIndex };
  }

  if (mode === "all") {
    const targetIndices = Array.from({ length: count }, (_, index) => index)
      .filter((index) => index !== sourceIndex);
    return { targetIndices, overwriteIndices: targetIndices, createIndex: null };
  }

  return { targetIndices: [], overwriteIndices: [], createIndex: null };
}
