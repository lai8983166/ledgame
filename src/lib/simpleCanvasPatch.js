export function drawTwoPhaseCanvasPatch(
  context,
  patchCells,
  {
    cellSize,
    resolvePatchCell,
    drawPatchCell,
    clearOffset = Math.max(4, Math.ceil(cellSize * 0.16)),
  },
) {
  const entries = [];
  for (const patchCell of patchCells || []) {
    const entry = resolvePatchCell(patchCell);
    if (entry) {
      entries.push(entry);
    }
  }

  for (const entry of entries) {
    context.clearRect(
      entry.left - clearOffset,
      entry.top - clearOffset,
      cellSize + clearOffset * 2,
      cellSize + clearOffset * 2,
    );
  }
  for (const entry of entries) {
    drawPatchCell(context, entry.cell);
  }
  return entries.length;
}
