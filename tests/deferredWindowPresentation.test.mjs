import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import focusModule from '../electron/window-focus.cjs'

const { createDeferredWindowPresentation } = focusModule

function fixture() {
  const calls = []
  function window(name, state) {
    const target = new EventEmitter()
    Object.assign(target, {
      isDestroyed: () => state.destroyed,
      isFocused: () => state.focused,
      isVisible: () => state.visible,
      isMinimized: () => state.minimized,
      showInactive: () => { state.visible = true; calls.push(`${name}.showInactive`) },
      webContents: { isDestroyed: () => false, isFocused: () => state.contentFocused,
        focus: () => { state.contentFocused = true; calls.push(`${name}.contents.focus`) } },
    })
    return target
  }
  const requesterState = { focused: true, visible: true, minimized: false, destroyed: false }
  const targetState = { focused: false, visible: false, minimized: false, destroyed: false, contentFocused: false }
  const requester = window('requester', requesterState)
  const target = window('target', targetState)
  let focused = requester, currentTarget = true
  const present = createDeferredWindowPresentation({
    targetWindow: target, requestWindow: requester,
    getFocusedWindow: () => focused, isCurrentTarget: () => currentTarget,
    activate: () => {
      calls.push('activate')
      targetState.visible = true; targetState.focused = true; targetState.contentFocused = true
      requesterState.focused = false; focused = target
    },
  })
  return { calls, requester, target, requesterState, targetState, present,
    switchTo: value => { focused = value }, invalidate: () => { currentTarget = false } }
}

test('a requested Touch window activates once while the requesting window still owns focus', () => {
  const f = fixture()
  assert.equal(f.present(), true)
  assert.deepEqual(f.calls, ['activate'])
  assert.equal(f.present(), false)
  assert.deepEqual(f.calls, ['activate'])
  assert.equal(f.requester.listenerCount('blur'), 0)
})

test('load completion never reactivates Touch after the user returned to another window', () => {
  const f = fixture()
  f.present()
  f.targetState.focused = false; f.targetState.contentFocused = false
  f.requesterState.focused = true; f.switchTo(f.requester)
  f.present()
  assert.deepEqual(f.calls, ['activate'])
})

test('requester focus loss before first paint only shows the new window without activating it', () => {
  const f = fixture()
  f.requesterState.focused = false; f.requester.emit('blur'); f.switchTo(null)
  assert.equal(f.present(), false)
  assert.deepEqual(f.calls, ['target.showInactive'])
})

test('returning to the requester does not revive an earlier lost activation request', () => {
  const f = fixture()
  f.requester.emit('blur')
  f.requesterState.focused = true; f.switchTo(f.requester)
  f.present()
  assert.deepEqual(f.calls, ['target.showInactive'])
})

for (const departure of ['minimized', 'hidden', 'destroyed', 'replaced']) {
  test(`load callbacks leave a ${departure} Touch window alone`, () => {
    const f = fixture()
    f.present()
    f.calls.length = 0
    if (departure === 'minimized') f.targetState.minimized = true
    if (departure === 'hidden') f.targetState.visible = false
    if (departure === 'destroyed') f.targetState.destroyed = true
    if (departure === 'replaced') f.invalidate()
    f.present()
    assert.deepEqual(f.calls, [])
  })
}

test('a minimized request is not restored during its first completion callback', () => {
  const f = fixture()
  f.targetState.minimized = true; f.target.emit('minimize')
  f.present()
  assert.deepEqual(f.calls, [])
})

test('closing before load completion releases requester listeners', () => {
  const f = fixture()
  f.targetState.destroyed = true; f.target.emit('closed')
  assert.equal(f.requester.listenerCount('blur'), 0)
  assert.equal(f.present(), false)
  assert.deepEqual(f.calls, [])
})
