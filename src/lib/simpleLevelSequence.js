export function deleteLevelAt(levels, activeIndex) {
  if (!Array.isArray(levels) || levels.length <= 1) {
    return {
      deleted: false,
      levels: Array.isArray(levels) ? levels : [],
      activeIndex: 0,
    };
  }

  const deleteIndex = Math.trunc(Number(activeIndex));
  if (!Number.isInteger(deleteIndex) || deleteIndex < 0 || deleteIndex >= levels.length) {
    return {
      deleted: false,
      levels,
      activeIndex: Math.min(levels.length - 1, Math.max(0, Number(activeIndex) || 0)),
    };
  }

  const nextLevels = levels.slice();
  nextLevels.splice(deleteIndex, 1);
  return {
    deleted: true,
    levels: nextLevels,
    activeIndex: Math.min(deleteIndex, nextLevels.length - 1),
  };
}
