const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
const { chromium, _electron } = require('playwright')
const { windowsSystemEnvironment } = require('../electron/backend-protection.cjs')

const root = path.resolve(__dirname, '..')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function mountSpirits(page) {
  await page.evaluate(() => {
    const initial = [1, 2, 3].map(id => ({ id: `fixture-${id}`, name: `验收精灵${id}`,
      width: 4, height: 4, color: 0, points: '[[0,0],[1,1]]', basic: false }))
    window.__inputFixture = { spirits: initial, deleted: [], created: [], counter: 0 }
    window.spiritLibrary = {
      list: async () => ({ data: JSON.parse(JSON.stringify(window.__inputFixture.spirits)) }),
      delete: async id => {
        window.__inputFixture.deleted.push(id)
        window.__inputFixture.spirits = window.__inputFixture.spirits.filter(item => item.id !== id)
        return { data: true }
      },
      create: async payload => {
        const state = window.__inputFixture
        const item = { ...payload, id: `created-${++state.counter}` }
        state.created.push(item)
        state.spirits.push(item)
        return { data: item }
      },
    }
    window.mountComponent('SpiritLibraryView', {})
  })
  await page.locator('.spirit-thumbnail-card').first().waitFor()
}

async function runDialogInputChecks({ electron = false, hold = false } = {}) {
  fs.mkdirSync(path.join(root, '.build'), { recursive: true })
  const work = fs.mkdtempSync(path.join(root, '.build', 'dialog-input-'))
  const port = Number(process.env.DIALOG_INPUT_PORT || 5198)
  const base = `http://127.0.0.1:${port}`
  const url = `${base}/tests/ui/catalog-library-harness.html`
  const log = fs.openSync(path.join(work, 'vite.log'), 'w')
  const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'),
    '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root, windowsHide: true, stdio: ['ignore', log, log],
  })
  fs.closeSync(log)
  let browser, electronApp
  const report = { engine: electron ? 'Windows Electron' : 'Chrome', checks: [], errors: [] }
  try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw Error(`Vite exited; see ${work}`)
      try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
      await pause(200)
    }
    assert.ok(ready, `Vite did not start; see ${work}`)
    let page
    if (electron) {
      const env = { ...process.env, DIALOG_INPUT_URL: url,
        DIALOG_INPUT_USER_DATA: path.join(work, 'electron-profile') }
      delete env.ELECTRON_RUN_AS_NODE
      electronApp = await _electron.launch({ executablePath: require('electron'),
        args: [path.join(root, 'tests/ui/dialog-input-electron.cjs')], env, timeout: 45000 })
      page = await electronApp.firstWindow()
    } else {
      browser = await chromium.launch({ channel: process.env.DIALOG_TEST_BROWSER_CHANNEL || 'chrome', headless: true })
      page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
      await page.goto(url)
    }
    page.on('pageerror', error => report.errors.push(error.message))
    page.setDefaultTimeout(20000)
    await page.waitForFunction(() => typeof window.mountComponent === 'function')
    await page.evaluate(() => { window.confirm = () => { throw Error('Native confirmation must not be called') } })
    await mountSpirits(page)
    await page.locator('.spirit-thumbnail-card').first().hover()
    await page.locator('.spirit-delete-button').first().click()
    await page.locator('.application-confirm-dialog').waitFor()
    await page.evaluate(() => {
      window.__oldAccept = document.querySelector('.application-confirm-dialog').__vueParentComponent.setupState.accept
    })
    await page.keyboard.press('Escape')
    await page.locator('.application-confirm-dialog').waitFor({ state: 'detached' })
    await page.locator('.spirit-thumbnail-card').first().hover()
    await page.locator('.spirit-delete-button').first().click()
    await page.locator('.application-confirm-dialog').waitFor()
    await page.evaluate(() => window.__oldAccept())
    assert.equal(await page.locator('.application-confirm-dialog').count(), 1)
    assert.equal(await page.evaluate(() => window.__inputFixture.deleted.length), 0)
    await page.keyboard.press('Escape')
    await page.locator('.application-confirm-dialog').waitFor({ state: 'detached' })
    report.checks.push('A late reply from a destroyed confirmation does not resolve a newer request')
    for (let cycle = 0; cycle < 3; cycle++) {
      const card = page.locator('.spirit-thumbnail-card').first()
      await card.hover()
      await card.locator('.spirit-delete-button').click()
      await page.locator('[data-testid="application-confirm-dialog"]').waitFor()
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '取消')
      await page.locator('.application-confirm-dialog button').nth(1).click()
      await page.waitForFunction(count => window.__inputFixture.deleted.length === count, cycle + 1)
      await page.locator('.icon-add-button').click()
      const name = page.locator('.spirit-editor-name input')
      await name.waitFor()
      assert.equal(await name.evaluate(input => document.activeElement === input), true)
      await name.click()
      await page.keyboard.type(`abc${cycle}123`)
      await page.keyboard.insertText('精灵')
      assert.equal(await name.inputValue(), `abc${cycle}123精灵`)
      for (const flags of [{ isComposing: true }, { keyCode: 229 }]) {
        await name.dispatchEvent('keydown', { key: 'Escape', bubbles: true, ...flags })
        assert.equal(await page.locator('.spirit-editor-dialog').count(), 1)
      }
      await page.locator('.spirit-editor-actions button.primary').click()
      await page.waitForFunction(count => window.__inputFixture.created.length === count, cycle + 1)
      await page.locator('.spirit-editor-dialog').waitFor({ state: 'detached' })
    }
    report.checks.push('Three delete-confirm-create cycles preserve name focus, typed ASCII and committed Chinese text')
    report.checks.push('Composition Escape and keyCode 229 retain the spirit draft')
    const beforeCancel = await page.evaluate(() => window.__inputFixture.deleted.length)
    const card = page.locator('.spirit-thumbnail-card').first()
    await card.hover()
    await card.locator('.spirit-delete-button').click()
    await page.keyboard.press('Escape')
    await page.locator('.application-confirm-dialog').waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => window.__inputFixture.deleted.length), beforeCancel)
    report.checks.push('Cancelled spirit deletion performs no write')

    await page.evaluate(() => {
      window.ledGame = {}
      window.mountComponent('SimpleGameEditorView', { initialDocument: {
        type: 'default', name: 'Input regression', siteSizeWidth: 4, siteSizeHeight: 4,
        levels: [{ label: 'Level 1', option: {}, frameList: [
          { repeatTimes: 1, matrix: [{ id: 'audit-object', x: 1, y: 1, color: 0, points: [[0, 0]] }] },
          { repeatTimes: 1, matrix: [] },
        ] }],
      } })
    })
    await page.waitForFunction(() => {
      const state = window.getComponentSetup()
      return state?.document?.levels?.length && !state.busyAction
    })
    await page.evaluate(() => {
      const state = window.getComponentSetup()
      state.selectedObjectId = 'audit-object'
      state.moveSelectedObject(1, 0)
    })
    assert.equal(await page.evaluate(() => window.getComponentSetup().canUndoRgbEdit), true,
      'Shortcut isolation needs a real undo entry')
    const snapshot = () => page.evaluate(() => {
      const state = window.getComponentSetup()
      return JSON.stringify({ document: state.document, frame: state.activeFrameIndex,
        selected: state.selectedObjectId, tool: state.drawingTool, undo: state.canUndoRgbEdit, redo: state.canRedoRgbEdit })
    })
    for (const [flag, selector] of [['effectDialogOpen', '.game-effect-dialog'],
      ['pixelLightLayoutOpen', '.pixel-layout-dialog']]) {
      await page.evaluate(name => { window.getComponentSetup()[name] = true }, flag)
      await page.locator(selector).waitFor()
      const before = await snapshot()
      for (const target of [selector, `${selector} button`]) {
        await page.locator(target).first().focus()
        for (const key of ['Delete', 'ArrowRight', 'ArrowDown', 'a', 'd', 'Control+z', 'Control+y', 'Alt+a', 'Alt+d']) {
          await page.keyboard.press(key)
          assert.equal(await snapshot(), before, `${selector} must isolate ${key}`)
        }
      }
      await page.evaluate(name => { window.getComponentSetup()[name] = false }, flag)
    }
    report.checks.push('Effect and pixel-light modals block background edit/history/frame/tool shortcuts from containers and buttons')
    await page.evaluate(() => {
      const state = window.getComponentSetup()
      state.effectDialogOpen = true
      window.__pendingConfirm = state.confirmAction('验收影响确认')
    })
    await page.locator('.application-confirm-dialog').waitFor()
    await page.keyboard.press('Escape')
    await page.locator('.application-confirm-dialog').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.game-effect-dialog').count(), 1)
    assert.equal(await page.evaluate(() => window.__pendingConfirm), false)
    report.checks.push('Escape cancels only the top confirmation and preserves the effect draft')
    await page.evaluate(() => {
      const state = window.getComponentSetup()
      window.__effectResult = { config: { color: 0, startX: 1, startY: 1, endX: 1, endY: 1,
        width: 1, height: 1, step: 1, mode: 'insert', useSprite: false, spriteId: '' }, frames: [{}] }
      window.__effectPending = state.applyEffectResult(window.__effectResult)
    })
    await page.locator('.application-confirm-dialog').waitFor()
    await page.locator('.application-confirm-dialog .action-button').click()
    const effect = await page.evaluate(async () => {
      await window.__effectPending
      const state = window.getComponentSetup()
      const applied = state.document.levels[0].frameList.length
      state.undoRgbEdit()
      return { applied, undone: state.document.levels[0].frameList.length }
    })
    assert.deepEqual(effect, { applied: 3, undone: 2 })
    await page.evaluate(() => {
      const state = window.getComponentSetup()
      state.openEffectDialog()
      window.__effectPending = state.applyEffectResult(window.__effectResult)
    })
    await page.locator('.application-confirm-dialog').waitFor()
    await page.evaluate(() => {
      const state = window.getComponentSetup()
      state.document = JSON.parse(JSON.stringify(state.document))
    })
    await page.locator('.application-confirm-dialog .action-button').click()
    assert.equal(await page.evaluate(async () => {
      await window.__effectPending
      return window.getComponentSetup().document.levels[0].frameList.length
    }), 2)
    report.checks.push('Effect confirmation preserves one undo transaction and cannot modify a replaced document')
    assert.deepEqual(report.errors, [])
    report.passed = true
    console.log(JSON.stringify(report, null, 2))
    if (hold) {
      assert.ok(electron, '--hold requires --electron')
      await mountSpirits(page)
      await page.locator('.icon-add-button').click()
      await page.locator('.spirit-editor-name input').waitFor()
      console.log(`WINDOW_READY: LED Game Input Regression; finish with ${path.join(work, 'finish')}`)
      while (!fs.existsSync(path.join(work, 'finish'))) await pause(500)
      report.nativeInput = await page.locator('.spirit-editor-name input').inputValue()
      assert.ok(report.nativeInput.length > 0, 'Expected native Windows input before finishing')
    }
    return report
  } catch (error) {
    report.passed = false
    report.failure = error.message
    throw error
  } finally {
    await electronApp?.close()
    await browser?.close()
    if (process.platform === 'win32') {
      const system = windowsSystemEnvironment(process.report.getReport())
      try { execFileSync(path.join(system.SYSTEMROOT, 'System32/taskkill.exe'),
        ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) } catch {}
    } else server.kill('SIGTERM')
    fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify(report, null, 2))
    console.log(`Dialog input regression evidence: ${work}`)
  }
}

if (require.main === module) {
  runDialogInputChecks({ electron: process.argv.includes('--electron'), hold: process.argv.includes('--hold') })
    .catch(error => { console.error(error); process.exitCode = 1 })
}
module.exports = { runDialogInputChecks }
