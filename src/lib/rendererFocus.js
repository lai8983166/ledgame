// Operation completion must preserve the user's current input and window.
// Never schedule a native activation or blur a newly selected control.
export function restoreRendererFocus(targetWindow = globalThis.window) {
  const document = targetWindow?.document;
  if (document?.hasFocus?.() !== true) return Promise.resolve();
  const activeElement = document.activeElement;
  if (activeElement?.isConnected && activeElement !== document.body &&
      activeElement !== document.documentElement && typeof activeElement.focus === 'function') {
    activeElement.focus({ preventScroll: true });
  }
  return Promise.resolve();
}
