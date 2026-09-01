import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  createDefaultElc408Config,
  createDefaultElc408Wiring,
} = require('../scripts/elc408-defaults.cjs')

test('portable package places default ELC408 files beside the executable', () => {
  const builder = JSON.parse(readFileSync(new URL('../electron-builder.json', import.meta.url), 'utf8'))
  assert.deepEqual(builder.extraFiles, [{
    from: 'build-resources/elc408',
    to: 'elc408',
    filter: ['conf.json', 'wiring.json'],
  }])
})

test('default ELC408 config expresses a portable link-local interface without build-machine identity', () => {
  const config = createDefaultElc408Config()
  assert.equal(config.tcpServerPort, 3003)
  assert.equal(config.controllerModel, 'HC08')
  assert.equal(config.rgbMode, 'RGB')
  assert.deepEqual(config.networkInterface, {
    localAddress: '169.254.1.10',
    prefixLength: 16,
    broadcastAddress: '169.254.255.255',
  })
  assert.equal(config.networkInterface.id, undefined)
  assert.equal(config.networkInterface.name, undefined)
  assert.equal(config.networkInterface.displayName, undefined)
  assert.equal(config.networkInterface.hardwareAddress, undefined)
})

test('default ELC408 wiring is a complete 16x36 row-serpentine layout', () => {
  const wiring = createDefaultElc408Wiring()
  const points = wiring.lines.flat()

  assert.equal(wiring.width, 16)
  assert.equal(wiring.height, 36)
  assert.equal(wiring.maxPointsPerChannel, 64)
  assert.equal(wiring.lines.length, 9)
  assert.deepEqual(wiring.lines.map((line) => line.length), Array(9).fill(64))
  assert.equal(points.length, 16 * 36)
  assert.equal(new Set(points.map(([x, y]) => `${x}:${y}`)).size, 16 * 36)
  assert.deepEqual(points.slice(0, 16), Array.from({ length: 16 }, (_, x) => [x, 0]))
  assert.deepEqual(points.slice(16, 32), Array.from({ length: 16 }, (_, index) => [15 - index, 1]))
})
