export const GAME_FIELD_DIMENSION_MAX = 50;
const valid = value => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= GAME_FIELD_DIMENSION_MAX;

export function invalidGameFieldDimensionPaths(document) {
  return ['siteSizeWidth', 'siteSizeHeight'].filter(field => !valid(document?.[field]));
}

export function gameFieldDimensionsValid(document) {
  return invalidGameFieldDimensionPaths(document).length === 0;
}

// Preserve old dimensions while displaying a draft; saving applies the current range.
export function gameFieldDimensionForDisplay(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function requireGameFieldDimensions(document) {
  if (!gameFieldDimensionsValid(document)) throw new RangeError('editorSave.fieldDimensions');
  return { width: document.siteSizeWidth, height: document.siteSizeHeight };
}
