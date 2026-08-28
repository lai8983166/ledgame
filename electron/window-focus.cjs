function isUsableWindow(targetWindow) {
  return Boolean(targetWindow && typeof targetWindow.isDestroyed === 'function' && !targetWindow.isDestroyed())
}

function restoreBrowserWindowFocus(targetWindow, options = {}) {
  if (!isUsableWindow(targetWindow)) {
    return false
  }
  const setImmediateFn = options.setImmediateFn || setImmediate
  const setTimeoutFn = options.setTimeoutFn || setTimeout

  const focusWindow = () => {
    if (!isUsableWindow(targetWindow)) {
      return
    }
    targetWindow.setFocusable(true)
    if (targetWindow.isMinimized()) {
      targetWindow.restore()
    }
    if (!targetWindow.isVisible()) {
      targetWindow.show()
    }
    targetWindow.moveTop()
    targetWindow.focus()
    targetWindow.webContents?.focus?.()
  }

  focusWindow()
  setImmediateFn(focusWindow)
  setTimeoutFn(focusWindow, 50)
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
