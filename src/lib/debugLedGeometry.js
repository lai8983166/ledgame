// All dimensions are CSS pixels. Each slot includes a symmetric half-gap, so
// its center is always (index + 0.5) * pitch, including at the outer edges.
export function debugLedGrid(columns, rows, pitch) {
  const width = Math.max(1, Math.trunc(columns) || 1);
  const height = Math.max(1, Math.trunc(rows) || 1);
  const cellPitch = Number.isFinite(pitch) ? Math.max(0, pitch) : 0;
  const gap = Math.min(4, cellPitch / 4);
  return { columns: width, rows: height, width: width * cellPitch,
    height: height * cellPitch, pitch: cellPitch, padding: gap / 2,
    gap, cellSize: cellPitch - gap };
}

export function fitDebugLedGrid(columns, rows, hostWidth, hostHeight) {
  const grid = debugLedGrid(columns, rows, 0);
  const width = Math.max(0, Number(hostWidth) || 0);
  const height = Math.max(0, Number(hostHeight) || 0);
  return debugLedGrid(grid.columns, grid.rows, Math.min(width / grid.columns, height / grid.rows));
}

export function debugLedCellAt(grid, pointX, pointY) {
  if (!grid.pitch || !Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
  const x = Math.floor(pointX / grid.pitch);
  const y = Math.floor(pointY / grid.pitch);
  if (x < 0 || y < 0 || x >= grid.columns || y >= grid.rows) return null;
  const localX = pointX - x * grid.pitch;
  const localY = pointY - y * grid.pitch;
  return localX >= grid.padding && localX < grid.pitch - grid.padding
    && localY >= grid.padding && localY < grid.pitch - grid.padding ? {x, y} : null;
}
