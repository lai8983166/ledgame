const { readFile, writeFile } = require('node:fs/promises')
const path = require('node:path')
const { createRequire } = require('node:module')
const { gameExecutableName } = require('../electron/game-launch.cjs')

const builderRequire = createRequire(require.resolve('electron-builder'))
const packagingRequire = createRequire(builderRequire.resolve('app-builder-lib'))
const { Data, NtExecutable, NtExecutableResource, Resource } = packagingRequire('resedit')

const standardExecutable = { name: 'LED Game.exe', icon: 'build-resources/icons/led-game.ico' }
const playExecutable = { name: gameExecutableName, icon: 'build-resources/icons/led-game-play.ico' }

async function preparePlayExecutable({ appOutDir, packager, electronPlatformName }) {
  if (electronPlatformName !== 'win32') return
  const source = path.join(appOutDir, standardExecutable.name)
  const target = path.join(appOutDir, playExecutable.name)
  // afterSign sees the primary executable with its fuses and ASAR integrity
  // resource installed. Rebuilding its PE resources drops any prior signature.
  const executable = NtExecutable.from(await readFile(source), { ignoreCert: true })
  const resources = NtExecutableResource.from(executable)
  const group = Resource.IconGroupEntry.fromEntries(resources.entries).find(item => item.id === 1)
  if (!group) throw new Error(`Missing Windows application icon in ${source}`)
  const icon = Data.IconFile.from(await readFile(path.join(packager.projectDir, playExecutable.icon)))
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icon.icons.map(item => item.data))
  resources.outputResource(executable)
  await writeFile(target, Buffer.from(executable.generate()), { flag: 'wx' })
  await packager.signIf(target)
}

module.exports = preparePlayExecutable
module.exports.standardExecutable = standardExecutable
module.exports.playExecutable = playExecutable
