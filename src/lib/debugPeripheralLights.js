import {normalizePixelLightWiring, buildPixelLightPreview, PIXEL_LIGHT_WALLS} from './pixelLightLayout.js';

// Runtime positions win over editor data: a running game owns a frozen layout.
export function debugPeripheralBoard(savedLayout, runtime, width, height) {
  let layout = normalizePixelLightWiring(savedLayout);
  if (runtime) {
    layout = normalizePixelLightWiring({
      selectedRow: runtime.selectedRow,
      form: {open: runtime.enabled ? 1 : 0, order: runtime.order,
        forceAlign: runtime.lights?.some(light => light.alignX != null) ? 1 : 0,
        ...Object.fromEntries(PIXEL_LIGHT_WALLS.map(wall => [wall.formKey,
          Math.max(0, ...(runtime.lights || []).filter(light => light.wall === wall.wall).map(light => light.index + 1))])),
      },
      rows: (runtime.lights || []).map(light => ({wall:light.wall, idx:light.index,
        align:light.alignX == null || light.alignY == null ? '' : `${light.alignX},${light.alignY}`})),
    });
  }
  if (!layout.form.open || !layout.rows.length) return null;
  const preview = buildPixelLightPreview(layout, width, height);
  const ordered = layout.form.order ? [...layout.rows] : [...layout.rows].reverse();
  const start = ordered.findIndex(row => `${row.wall}|${row.idx}` === layout.selectedRow);
  const chain = start < 0 ? ordered : [...ordered.slice(start), ...ordered.slice(0,start)];
  preview.lights = preview.lights.map(light => {
    const state = runtime?.lights?.find(row => row.wall === light.wall && row.index === light.idx);
    return {...light, sequenceIndex:state?.sequenceIndex ?? chain.findIndex(row => row.wall===light.wall && row.idx===light.idx),
      phase:state?.phase || 'OFF', remaining:state?.remaining ?? 0};
  });
  return preview;
}
