function isUsableWindow(targetWindow) {
  return Boolean(targetWindow && typeof targetWindow.isDestroyed === 'function' && !targetWindow.isDestroyed())
}

function restoreBrowserWindowFocus(targetWindow, options = {}) {
  if (!isUsableWindow(targetWindow)) {
    return false
  }
  const setImmediateFn = options.setImmediateFn || setImmediate
  if (targetWindow.isFocusable?.() === false) targetWindow.setFocusable(true)
  if (targetWindow.isMinimized()) targetWindow.restore()
  if (!targetWindow.isVisible()) targetWindow.show()
  if (!targetWindow.isFocused()) targetWindow.focus()

  const focusContents = () => {
    // A native dialog may release its input focus on the next Windows message loop.
    // Never raise the window again if the user has already switched elsewhere.
    if (!isUsableWindow(targetWindow) || !targetWindow.isFocused()) return
    const contents = targetWindow.webContents
    if (contents && !contents.isDestroyed?.() && !contents.isFocused?.()) contents.focus?.()
  }
  focusContents()
  setImmediateFn(focusContents)
  return true
}

async function showNativeDialogWithFocusRestore({
  BrowserWindow,
  dialog,
  event,
  method,
  options,
  focusOptions,
}) {
  const candidate = BrowserWindow?.fromWebContents?.(event?.sender)
  const targetWindow = isUsableWindow(candidate) ? candidate : null
  const showDialog = dialog?.[method]
  if (typeof showDialog !== 'function') {
    throw new TypeError(`Unsupported native dialog method: ${method}`)
  }

  try {
    return targetWindow
      ? await showDialog.call(dialog, targetWindow, options)
      : await showDialog.call(dialog, options)
  } finally {
    restoreBrowserWindowFocus(targetWindow, focusOptions)
  }
}

module.exports = {
  restoreBrowserWindowFocus,
  showNativeDialogWithFocusRestore,
}
