const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_WIDTH = 16
const DEFAULT_HEIGHT = 36
const DEFAULT_MAX_POINTS_PER_CHANNEL = 64
const DEFAULT_TCP_SERVER_PORT = 3003
const DEFAULT_ELC408_LOCAL_ADDRESS = '169.254.1.10'
const DEFAULT_ELC408_PREFIX_LENGTH = 16
const DEFAULT_ELC408_BROADCAST_ADDRESS = '169.254.255.255'

function createRowSerpentinePoints(width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
  const points = []
  for (let y = 0; y < height; y += 1) {
    if (y % 2 === 0) {
      for (let x = 0; x < width; x += 1) points.push([x, y])
    } else {
      for (let x = width - 1; x >= 0; x -= 1) points.push([x, y])
    }
  }
  return points
}

function splitIntoChannels(points, maxPointsPerChannel = DEFAULT_MAX_POINTS_PER_CHANNEL) {
  const lines = []
  for (let index = 0; index < points.length; index += maxPointsPerChannel) {
    lines.push(points.slice(index, index + maxPointsPerChannel))
  }
  return lines
}

function createDefaultElc408Config() {
  return {
    schemaVersion: 1,
    tcpServerPort: DEFAULT_TCP_SERVER_PORT,
    allowRepeatActiveOnDown: false,
    debounceMillis: 50,
    networkInterface: {
      localAddress: DEFAULT_ELC408_LOCAL_ADDRESS,
      prefixLength: DEFAULT_ELC408_PREFIX_LENGTH,
      broadcastAddress: DEFAULT_ELC408_BROADCAST_ADDRESS,
    },
    controllerModel: 'HC08',
    rgbMode: 'RGB',
  }
}

function createDefaultElc408Wiring() {
  return {
    schemaVersion: 1,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    maxPointsPerChannel: DEFAULT_MAX_POINTS_PER_CHANNEL,
    lines: splitIntoChannels(createRowSerpentinePoints()),
  }
}

function writeDefaultElc408Files(targetDirectory) {
  fs.mkdirSync(targetDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(targetDirectory, 'conf.json'),
    `${JSON.stringify(createDefaultElc408Config(), null, 2)}\n`,
    'utf8',
  )
  fs.writeFileSync(
    path.join(targetDirectory, 'wiring.json'),
    `${JSON.stringify(createDefaultElc408Wiring(), null, 2)}\n`,
    'utf8',
  )
}

module.exports = {
  DEFAULT_ELC408_BROADCAST_ADDRESS,
  DEFAULT_ELC408_LOCAL_ADDRESS,
  DEFAULT_ELC408_PREFIX_LENGTH,
  DEFAULT_HEIGHT,
  DEFAULT_MAX_POINTS_PER_CHANNEL,
  DEFAULT_TCP_SERVER_PORT,
  DEFAULT_WIDTH,
  createDefaultElc408Config,
  createDefaultElc408Wiring,
  createRowSerpentinePoints,
  splitIntoChannels,
  writeDefaultElc408Files,
}
