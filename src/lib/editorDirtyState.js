export function editorSnapshot(document) {
  return JSON.stringify(document, (key, value) => key === '__matrixVersion' ? undefined : value);
}
