const cursor = (body, x, y, fallback) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${body}</svg>`)}") ${x} ${y}, ${fallback}`;

const BRUSH_CURSOR = cursor('<path d="M4 20l2-7L16 3l5 5L11 18z" fill="white" stroke="black" stroke-width="1.5"/><path d="M6 13l5 5M16 3l5 5M4 20l4-1" fill="none" stroke="black" stroke-width="1.5"/>', 4, 20, 'crosshair');
const DELETE_CURSOR = cursor('<circle cx="12" cy="12" r="9" fill="white" stroke="black" stroke-width="1.5"/><path d="M7 12h10" stroke="black" stroke-width="2"/>', 12, 12, 'crosshair');

export function drawingToolCursor(tool, occupied = false, dragging = false) {
  if (tool === 'add') return BRUSH_CURSOR;
  if (tool === 'delete') return DELETE_CURSOR;
  if (tool === 'region') return 'crosshair';
  return dragging ? 'grabbing' : occupied ? 'grab' : 'default';
}
