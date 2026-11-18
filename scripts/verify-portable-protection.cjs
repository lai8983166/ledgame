const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { createRequire } = require('node:module')
const { standardExecutable, playExecutable } = require('./prepare-play-executable.cjs')

// Resolve the versions used by our packager, without adding parallel tool dependencies.
const builderRequire = createRequire(require.resolve('electron-builder'))
const packagingRequire = createRequire(builderRequire.resolve('app-builder-lib'))
const fuses = packagingRequire('@electron/fuses')
const { FuseState } = createRequire(packagingRequire.resolve('@electron/fuses'))('./constants')
const asar = packagingRequire('@electron/asar')
const { Data, NtExecutable, NtExecutableResource, Resource } = packagingRequire('resedit')

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const manifestEntry = 'electron/backend-integrity.generated.cjs'
const requiredFuses = {
  RunAsNode: FuseState.DISABLE,
  EnableNodeOptionsEnvironmentVariable: FuseState.DISABLE,
  EnableNodeCliInspectArguments: FuseState.DISABLE,
  EnableEmbeddedAsarIntegrityValidation: FuseState.ENABLE,
  OnlyLoadAppFromAsar: FuseState.ENABLE,
}

function iconFrame(width, height, bytes) {
  return `${width || 256}x${height || 256}:${sha256(Buffer.from(bytes))}`
}

async function verifyIcon(entries, iconPath) {
  const groups = Resource.IconGroupEntry.fromEntries(entries).filter(group => group.id === 1)
  if (groups.length !== 1) throw new Error('Expected one Windows application icon group')
  const [group] = groups
  const embedded = group.icons.map(({ width, height, iconID }) => {
    const icon = entries.find(item => item.type === 3 && item.id === iconID && item.lang === group.lang)
    if (!icon) throw new Error('Missing embedded Windows application icon frame')
    return iconFrame(width, height, icon.bin)
  }).sort()
  const source = Data.IconFile.from(await fsp.readFile(iconPath)).icons.map(({ width, height, data }) =>
    iconFrame(width, height, data.isRaw() ? data.bin : data.generate())).sort()
  if (!source.length || JSON.stringify(embedded) !== JSON.stringify(source)) {
    throw new Error(`Embedded Windows application icon does not match ${path.basename(iconPath)}`)
  }
}

async function verifyExecutable(executablePath, headerHash, iconPath) {
  const wire = await fuses.getCurrentFuseWire(executablePath)
  if (wire.version !== fuses.FuseVersion.V1) throw new Error(`Unsupported Electron fuse version: ${wire.version}`)
  for (const [name, state] of Object.entries(requiredFuses)) {
    if (wire[fuses.FuseV1Options[name]] !== state) throw new Error(`Unsafe Electron fuse: ${name}`)
  }

  const executable = NtExecutable.from(await fsp.readFile(executablePath), { ignoreCert: true })
  const entries = NtExecutableResource.from(executable).entries
  const integrityEntries = entries.filter((entry) =>
    String(entry.type).toUpperCase() === 'INTEGRITY' && String(entry.id).toUpperCase() === 'ELECTRONASAR')
  if (integrityEntries.length !== 1) throw new Error('Expected one embedded Electron ASAR integrity resource')
  const resources = JSON.parse(Buffer.from(integrityEntries[0].bin).toString('utf8'))
  if (!Array.isArray(resources)) throw new Error('Invalid embedded Electron ASAR integrity resource')
  const appEntries = resources.filter((entry) => typeof entry.file === 'string' &&
    path.win32.normalize(entry.file).toLowerCase() === 'resources\\app.asar')
  if (appEntries.length !== 1 || String(appEntries[0].alg).toLowerCase() !== 'sha256') {
    throw new Error('Expected one SHA-256 entry for resources/app.asar')
  }

  if (appEntries[0].value !== headerHash) throw new Error('Embedded ASAR header hash does not match app.asar')
  await verifyIcon(entries, iconPath)
}

async function verifyPortableProtection(directory) {
  const outputDirectory = path.resolve(directory)
  const asarPath = path.join(outputDirectory, 'resources', 'app.asar')
  const jarPath = path.join(outputDirectory, 'resources', 'backend', 'ledGame-backend.jar')
  // ASAR header hashes bind the per-file integrity metadata to both executables.
  asar.uncache(asarPath)
  const headerHash = sha256(asar.getRawHeader(asarPath).headerString)
  const executables = [standardExecutable, playExecutable]
  for (const { name, icon } of executables) {
    try {
      await verifyExecutable(path.join(outputDirectory, name), headerHash, path.join(__dirname, '..', icon))
    } catch (error) {
      throw new Error(`${name}: ${error.message}`, { cause: error })
    }
  }
  const manifestStat = asar.statFile(asarPath, manifestEntry, false)
  if (manifestStat.unpacked || manifestStat.link || manifestStat.files) {
    throw new Error('Backend integrity manifest must be a packed file inside app.asar')
  }
  const manifestBytes = asar.extractFile(asarPath, manifestEntry, false)
  if (manifestStat.integrity?.algorithm !== 'SHA256' || manifestStat.integrity.hash !== sha256(manifestBytes)) {
    throw new Error('Backend integrity manifest content does not match its ASAR integrity hash')
  }
  // Parse generated data without executing any code from the inspected package.
  const match = manifestBytes.toString('utf8').match(/^(?:\/\/[^\r\n]*\r?\n)*module\.exports\s*=\s*(\{[^\r\n]*\})\s*;?\s*$/)
  if (!match) throw new Error('Invalid generated backend integrity manifest')
  const manifest = JSON.parse(match[1])
  if (!manifest || Object.keys(manifest).length !== 1 || !/^[a-f0-9]{64}$/.test(manifest.jarSha256)) {
    throw new Error('Invalid backend SHA-256 in generated manifest')
  }
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(jarPath)) hash.update(chunk)
  if (hash.digest('hex') !== manifest.jarSha256) throw new Error('Packaged backend JAR does not match its trusted SHA-256')
  return { directory: outputDirectory, executableCount: executables.length, fuseCount: Object.keys(requiredFuses).length, jarSha256: manifest.jarSha256 }
}

if (require.main === module) {
  verifyPortableProtection(process.argv[2] || path.join(__dirname, '..', 'release', 'win-unpacked'))
    .then((result) => console.log(`Portable protection verified: ${result.executableCount} executables with ${result.fuseCount} fuses each, embedded icons and ASAR integrity, packed manifest and backend JAR (${result.directory})`))
    .catch((error) => {
      console.error(`Portable protection verification failed: ${error.message}`)
      process.exitCode = 1
    })
}

module.exports = { verifyPortableProtection }
