function isUsableWindow(targetWindow) {
  return Boolean(targetWindow && typeof targetWindow.isDestroyed === 'function' && !targetWindow.isDestroyed())
}

function restoreBrowserWindowFocus(targetWindow, options = {}) {
  if (!isUsableWindow(targetWindow)) {
    return false
  }
  const setImmediateFn = options.setImmediateFn || setImmediate
  const canRestoreContents = () => isUsableWindow(targetWindow) &&
    !targetWindow.isMinimized() && targetWindow.isVisible() && targetWindow.isFocused() &&
    (!options.isCurrentWindow || options.isCurrentWindow())
  if (options.activate === false) {
    // Dialog completion is not a new user request to activate the owner.
    if (!canRestoreContents()) return false
  } else {
    if (targetWindow.isFocusable?.() === false) targetWindow.setFocusable(true)
    if (targetWindow.isMinimized()) targetWindow.restore()
    if (!targetWindow.isVisible()) targetWindow.show()
    if (!targetWindow.isFocused()) targetWindow.focus()
  }

  const focusContents = () => {
    // A native dialog may release its input focus on the next Windows message loop.
    // Never raise the window again if the user has already switched elsewhere.
    if (!canRestoreContents()) return
    const contents = targetWindow.webContents
    if (contents && !contents.isDestroyed?.() && !contents.isFocused?.()) contents.focus?.()
  }
  focusContents()
  setImmediateFn(focusContents)
  return true
}

function createDeferredWindowPresentation({ targetWindow, requestWindow, getFocusedWindow, isCurrentTarget, activate }) {
  let presented = false
  let requestOwnsFocus = true
  const subscriptions = []
  const revoke = () => { requestOwnsFocus = false }
  const release = () => {
    for (const [window, event, handler] of subscriptions) window.removeListener?.(event, handler)
    subscriptions.length = 0
  }
  const subscribe = (window, event, handler) => {
    if (!isUsableWindow(window) || typeof window.on !== 'function') return
    window.on(event, handler)
    subscriptions.push([window, event, handler])
  }
  for (const event of ['blur', 'hide', 'minimize']) subscribe(requestWindow, event, revoke)
  for (const event of ['hide', 'minimize']) subscribe(targetWindow, event, revoke)
  subscribe(targetWindow, 'closed', release)
  const isCurrentWindow = () => !getFocusedWindow || getFocusedWindow() === targetWindow

  return () => {
    if (!isUsableWindow(targetWindow) || !isCurrentTarget()) {
      release()
      return false
    }
    if (presented) {
      restoreBrowserWindowFocus(targetWindow, { activate: false, isCurrentWindow })
      return false
    }
    presented = true
    release()
    const requesterStillCurrent = requestOwnsFocus && isUsableWindow(requestWindow) &&
      requestWindow.isFocused() && requestWindow.isVisible() && !requestWindow.isMinimized() &&
      (!getFocusedWindow || getFocusedWindow() === requestWindow)
    if (requesterStillCurrent && !targetWindow.isMinimized()) {
      activate()
      return true
    }
    // Keep an explicitly requested window available without undoing a later
    // application/window switch. Never unminimize it from a load callback.
    if (!targetWindow.isVisible() && !targetWindow.isMinimized()) targetWindow.showInactive?.()
    restoreBrowserWindowFocus(targetWindow, { activate: false, isCurrentWindow })
    return false
  }
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
    restoreBrowserWindowFocus(targetWindow, {
      ...focusOptions,
      activate: false,
      isCurrentWindow: () => typeof BrowserWindow?.getFocusedWindow !== 'function' ||
        BrowserWindow.getFocusedWindow() === targetWindow,
    })
  }
}

module.exports = {
  restoreBrowserWindowFocus,
  createDeferredWindowPresentation,
  showNativeDialogWithFocusRestore,
}
