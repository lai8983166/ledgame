// Let the wait cursor reach the screen before synchronous validation/serialization.
// The timeout also allows saving to finish if a hidden window stops producing rAF.
export async function withEditorSavingCursor(action, targetWindow = globalThis.window) {
  const root = targetWindow.document.documentElement;
  root.classList.add('editor-saving');
  let timeout, firstFrame, secondFrame;
  try {
    await new Promise(resolve => {
      timeout = targetWindow.setTimeout(resolve, 100);
      firstFrame = targetWindow.requestAnimationFrame(() => {
        secondFrame = targetWindow.requestAnimationFrame(resolve);
      });
    });
    targetWindow.clearTimeout(timeout);
    targetWindow.cancelAnimationFrame(firstFrame);
    if (secondFrame) targetWindow.cancelAnimationFrame(secondFrame);
    return await action();
  } finally {
    targetWindow.clearTimeout(timeout);
    if (firstFrame) targetWindow.cancelAnimationFrame(firstFrame);
    if (secondFrame) targetWindow.cancelAnimationFrame(secondFrame);
    root.classList.remove('editor-saving');
  }
}
