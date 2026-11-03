const activationChannels = new Set([
  'activation:status', 'activation:submit', 'activation:copy-machine', 'activation:paste-code', 'activation:exit',
  'backend:status', 'window:minimize', 'window:toggle-maximize', 'window:close', 'app-language:get',
])

function createActivationIpcGate({ ipcMain, requireActivated }) {
  return {
    on: ipcMain.on.bind(ipcMain),
    handle(channel, handler) {
      ipcMain.handle(channel, async (event, ...args) => {
        if (!activationChannels.has(channel)) await requireActivated()
        return handler(event, ...args)
      })
    },
  }
}

function registerActivationIpc({ ipcMain, backendRequest, clipboard, isMainSender, broadcast, onStatus = () => {}, exitUnactivated }) {
  const status = async () => {
    try {
      const result = await backendRequest('/activation')
      await onStatus(result.data)
      return result
    } catch (error) {
      await onStatus({ activated: false })
      throw error
    }
  }
  function requireMain(event) {
    if (!isMainSender(event)) throw new Error('请在管理员主窗口操作软件激活')
  }
  ipcMain.handle('activation:status', status)
  ipcMain.handle('activation:submit', async (event, activationCode) => {
    requireMain(event)
    if (typeof activationCode !== 'string' || activationCode.length > 16384) {
      throw new Error('激活码为空或过长，请重新复制完整激活码')
    }
    const result = await backendRequest('/activation', {
      method: 'POST', body: JSON.stringify({ activationCode }),
    })
    await onStatus(result.data)
    broadcast(result.data)
    return result
  })
  ipcMain.handle('activation:copy-machine', async (event) => {
    requireMain(event)
    const result = await status()
    if (!/^LGG1-[0-9A-F]{64}$/.test(result?.data?.machineCode || '')) {
      throw new Error(result?.data?.message || '无法读取本机机器码，请重试')
    }
    clipboard.writeText(result.data.machineCode)
    return result
  })
  ipcMain.handle('activation:paste-code', (event) => {
    requireMain(event)
    const code = clipboard.readText()
    if (code.length > 16384) throw new Error('激活码过长，请重新复制完整激活码')
    return code
  })
  ipcMain.handle('activation:exit', (event) => {
    requireMain(event)
    return exitUnactivated()
  })
}

module.exports = { registerActivationIpc, createActivationIpcGate }
