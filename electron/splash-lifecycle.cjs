function createSplashLifecycle({
  createWindow,
  timeoutMs = 45_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  onWatchdog = () => {},
}) {
  let window = null
  let timer = null

  function close(reason = 'closed') {
    if (timer) clearTimeoutFn(timer)
    timer = null
    if (window && !window.isDestroyed()) window.destroy()
    window = null
    return reason
  }

  function open() {
    close('replaced')
    window = createWindow()
    timer = setTimeoutFn(() => {
      close('watchdog')
      onWatchdog()
    }, timeoutMs)
    return window
  }

  return {
    open,
    close,
    getWindow: () => window,
  }
}

module.exports = { createSplashLifecycle }
