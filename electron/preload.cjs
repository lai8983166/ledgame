const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ledGame', {
  windowKind: new URLSearchParams(window.location.search).get('window') === 'debug' ? 'debug' : 'main',
  openDebugPanel: () => ipcRenderer.invoke('open-debug-panel'),
  startFixed: () => ipcRenderer.invoke('engine:start-fixed'),
  startInput: () => ipcRenderer.invoke('engine:start-input'),
  stop: () => ipcRenderer.invoke('engine:stop'),
  state: () => ipcRenderer.invoke('engine:state'),
  sendInput: (input) => ipcRenderer.invoke('engine:input', input),
  latestFrame: () => ipcRenderer.invoke('frame:latest'),
  onLedFrame: (callback) => {
    const listener = (_event, frame) => callback(frame)
    ipcRenderer.on('led-frame', listener)
    return () => ipcRenderer.removeListener('led-frame', listener)
  },
})
