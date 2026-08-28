function applyRendererFocus(targetWindow) {
  targetWindow?.focus?.();
  const activeElement = targetWindow?.document?.activeElement;
  if (activeElement && typeof activeElement.blur === "function") {
    activeElement.blur();
  }
}

export function restoreRendererFocus(targetWindow = globalThis.window) {
  let restoreWindowFocus;
  try {
    restoreWindowFocus = targetWindow?.ledGame?.restoreFocus?.();
  } catch (_error) {
    restoreWindowFocus = null;
  }

  applyRendererFocus(targetWindow);
  if (!restoreWindowFocus || typeof restoreWindowFocus.then !== "function") {
    return Promise.resolve();
  }
  return Promise.resolve(restoreWindowFocus).then(
    () => applyRendererFocus(targetWindow),
    () => undefined,
  );
}

export function confirmWithRendererFocus(message, targetWindow = globalThis.window) {
  try {
    return targetWindow.confirm(message);
  } finally {
    void restoreRendererFocus(targetWindow);
  }
}
