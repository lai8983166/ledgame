// Isolated Windows input fixture: no backend, license or customer database APIs.
const fs = require('node:fs')
const { app, BrowserWindow } = require('electron')

if (process.env.DIALOG_INPUT_USER_DATA) {
  fs.mkdirSync(process.env.DIALOG_INPUT_USER_DATA, { recursive: true })
  app.setPath('userData', process.env.DIALOG_INPUT_USER_DATA)
}
app.whenReady().then(() => {
  app.setAccessibilitySupportEnabled(true)
  const window = new BrowserWindow({
    width: 1366, height: 900, title: 'LED Game Input Regression',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  window.setMenu(null)
  window.on('page-title-updated', event => event.preventDefault())
  return window.loadURL(process.env.DIALOG_INPUT_URL)
})
app.on('window-all-closed', () => app.quit())
