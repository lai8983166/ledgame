import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import gameLaunch from '../electron/game-launch.cjs'

const { executableStartsGame, gameExecutableName } = gameLaunch
const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
const secondInstanceHandler = main.slice(
  main.indexOf("app.on('second-instance'"),
  main.indexOf('const splashLifecycle ='),
)
const launchIpc = main.slice(
  main.indexOf("ipcMain.handle('window:take-game-launch'"),
  main.indexOf("ipcMain.on('window:close-response'"),
)

test('only the packaged player executable selects direct game entry', () => {
  assert.equal(executableStartsGame(true, `C:\\LED game folder\\${gameExecutableName.toUpperCase()}`), true)
  assert.equal(executableStartsGame(true, 'C:/LED game folder/LED Game.exe'), false)
  assert.equal(executableStartsGame(false, '/development/LED Game Play.exe'), false)
})

function fixture({ direct = false, mainReady = true, player = false } = {}) {
  const calls = []
  const listeners = new Map()
  const handlers = new Map()
  const mainWindow = {
    isDestroyed: () => false,
    webContents: { send: channel => calls.push(channel) },
  }
  const context = {
    app: { on: (event, handler) => listeners.set(event, handler) },
    ipcMain: {
      on: (event, handler) => listeners.set(event, handler),
      handle: (event, handler) => handlers.set(event, handler),
    },
    activateMainWindow: () => calls.push('focus management'),
    activateTouchWindow: () => calls.push('focus game'),
    revealMainWindowAfterGameLaunch: () => calls.push('reveal management'),
    initialGamePresentationPending: direct,
    gameLaunchRequested: direct,
    gameLaunchInProgress: false,
    mainReadyToShow: mainReady,
    mainWindow: mainReady ? mainWindow : null,
    touchWindow: player ? { isDestroyed: () => false, isVisible: () => true } : null,
    touchPresentationMode: player ? 'game' : 'debug',
    quitCleanupStarted: false,
  }
  vm.runInNewContext(secondInstanceHandler + launchIpc, context)
  return {
    calls,
    start: (enterGame) => listeners.get('second-instance')(null, [], '', { enterGame }),
    take: (sender = mainWindow.webContents) => handlers.get('window:take-game-launch')({ sender }),
    finish: (launched) => listeners.get('window:game-launch-finished')({ sender: mainWindow.webContents }, launched),
    createMain: () => { context.mainWindow = mainWindow; context.mainReadyToShow = true },
  }
}

test('a cold player launch can be consumed once, only by its management renderer', () => {
  const f = fixture({ direct: true })
  assert.equal(f.take({}), false)
  assert.equal(f.take(), true)
  assert.equal(f.take(), false)
  f.start(true)
  assert.deepEqual(f.calls, [])
  f.finish(false)
  assert.deepEqual(f.calls, ['reveal management'])
})

test('a game launch during management startup is retained until its renderer can claim it', () => {
  const f = fixture({ mainReady: false })
  f.start(true)
  f.createMain()
  assert.equal(f.take(), true)
  f.finish(true)
  assert.equal(f.take(), false)
  assert.deepEqual(f.calls, [])
})

test('repeated requests coalesce and each executable selects the expected visible window', () => {
  const management = fixture()
  management.start(false)
  management.start(true)
  management.start(true)
  assert.equal(management.take(), true)
  management.start(true)
  assert.deepEqual(management.calls, ['focus management', 'focus management', 'window:game-launch-requested'])
  management.finish(false)
  management.start(true)
  assert.equal(management.take(), true)

  const player = fixture({ player: true })
  player.start(true)
  player.start(false)
  assert.deepEqual(player.calls, ['focus game', 'focus management'])
  assert.equal(player.take(), false)
})
