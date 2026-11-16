const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')

const PERSISTENT_DATA = ['database', 'settings', 'branding']
const PRESERVED_ROOTS = ['data', 'resources/media', 'elc408']

function inside(root, candidate) {
  const resolved = path.resolve(candidate)
  const relative = path.relative(path.resolve(root), resolved)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Portable rebuild path must remain inside ${root}: ${resolved}`)
  }
  return resolved
}

function exists(file) {
  try { fs.lstatSync(file); return true } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function requireRealDirectory(directory) {
  if (!exists(directory)) return
  const stat = fs.lstatSync(directory)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Portable rebuild requires a real directory: ${directory}`)
}

function requireUnlinkedAncestors(root, candidate) {
  requireRealDirectory(root)
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Portable rebuild path must remain inside ${root}: ${candidate}`)
  }
  let current = root
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component)
    if (!exists(current)) return
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Portable rebuild refuses linked paths: ${current}`)
  }
}

function walk(directory, visitor, relative = '') {
  const stat = fs.lstatSync(directory)
  if (stat.isSymbolicLink()) throw new Error(`Portable rebuild refuses linked paths: ${directory}`)
  if (stat.isDirectory()) {
    visitor(directory, relative, true)
    for (const name of fs.readdirSync(directory).sort()) walk(path.join(directory, name), visitor, path.join(relative, name))
  } else if (stat.isFile()) visitor(directory, relative, false)
  else throw new Error(`Unsupported portable rebuild file: ${directory}`)
}

function copyTree(source, target, { skipData = false, workspaceRoot } = {}) {
  if (workspaceRoot) {
    requireUnlinkedAncestors(workspaceRoot, source)
    requireUnlinkedAncestors(workspaceRoot, target)
  }
  walk(source, (file, relative, directory) => {
    if (skipData && relative.split(path.sep)[0] === 'data') return
    const destination = relative ? inside(target, path.join(target, relative)) : target
    if (workspaceRoot) requireUnlinkedAncestors(workspaceRoot, destination)
    if (exists(destination) && fs.lstatSync(destination).isSymbolicLink()) {
      throw new Error(`Portable rebuild refuses linked destinations: ${destination}`)
    }
    if (directory) fs.mkdirSync(destination, { recursive: true })
    else fs.copyFileSync(file, destination)
  })
}

async function fingerprint(directory) {
  const manifest = {}
  if (!exists(directory)) return manifest
  const files = []
  walk(directory, (file, relative, isDirectory) => {
    const key = relative.split(path.sep).join('/') || '.'
    if (isDirectory) manifest[`${key}/`] = 'directory'
    else files.push([key, file])
  })
  for (const [relative, file] of files) {
    const hash = createHash('sha256')
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
    manifest[relative] = hash.digest('hex')
  }
  return manifest
}

async function preservedFingerprint(source) {
  const manifest = {}
  requireRealDirectory(source)
  for (const relative of PRESERVED_ROOTS) {
    const candidate = path.join(source, relative)
    requireUnlinkedAncestors(source, candidate)
    manifest[relative] = await fingerprint(candidate)
  }
  return manifest
}

function publishArchive(source, destination, { copy = fs.copyFileSync, rename = fs.renameSync } = {}) {
  const directory = path.dirname(destination)
  requireUnlinkedAncestors(path.dirname(source), source)
  requireUnlinkedAncestors(directory, destination)
  const temporary = inside(directory, path.join(directory, `.portable-rebuild-${randomUUID()}.zip.tmp`))
  // Never open the previous ZIP for writing. An interrupted copy leaves its
  // original contents and the validated stage intact for the next attempt.
  copy(source, temporary, fs.constants.COPYFILE_EXCL)
  rename(temporary, destination)
}

async function verifyPreservedFiles(snapshot, stagedApp, projectRoot) {
  for (const relative of [...PERSISTENT_DATA.map(name => `data/${name}`), 'resources/media', 'elc408']) {
    const original = path.join(snapshot, relative)
    if (!exists(original)) continue
    requireUnlinkedAncestors(projectRoot, original)
    requireUnlinkedAncestors(projectRoot, path.join(stagedApp, relative))
    const expected = await fingerprint(original)
    const actual = await fingerprint(path.join(stagedApp, relative))
    // An empty source directory may be omitted by electron-builder. It still
    // must not be replaced with the default source's files.
    const empty = manifest => Object.values(manifest).every(value => value === 'directory')
    if (!(empty(expected) && empty(actual)) && !sameManifest(expected, actual)) {
      throw new Error(`Rebuilt package did not preserve ${relative}; old output remains unchanged`)
    }
  }
}

function sameManifest(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

function runningPackageProcesses(directory, { platform = process.platform, run = execFileSync } = {}) {
  if (platform !== 'win32') return []
  const { windowsSystemEnvironment } = require('../electron/backend-protection.cjs')
  const system = windowsSystemEnvironment(process.report.getReport())
  const powershell = path.join(system.SYSTEMROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = '$ErrorActionPreference="Stop"; $prefix=[IO.Path]::GetFullPath($env:LED_REBUILD_PROCESS_ROOT).TrimEnd([char]92)+[char]92; '
    + '@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) } '
    + '| Select-Object ProcessId,Name) | ConvertTo-Json -Compress'
  const result = run(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 20000,
    env: { ...process.env, ...system, LED_REBUILD_PROCESS_ROOT: path.resolve(directory) },
  }).trim()
  if (!result) return []
  const parsed = JSON.parse(result)
  return Array.isArray(parsed) ? parsed : [parsed]
}

async function requireStopped(source, probe) {
  const running = await probe(source)
  if (running.length) {
    const error = new Error('旧发行包仍在运行，请保存编辑内容并关闭游戏端及其后台服务后重新打包。')
    error.code = 'PORTABLE_PACKAGE_RUNNING'
    throw error
  }
}

function createBuildConfig(base, snapshot, output, projectRoot) {
  const config = structuredClone(base)
  config.directories = { ...config.directories, output }
  config.extraResources = (config.extraResources || []).map(entry => {
    if (typeof entry !== 'object' || entry.to !== 'media' || !exists(path.join(snapshot, 'resources', 'media'))) return entry
    return { from: path.join(snapshot, 'resources', 'media'), to: 'media', filter: ['**/*'] }
  })
  config.extraFiles = (config.extraFiles || []).map(entry => {
    if (typeof entry !== 'object' || entry.to !== 'elc408' || !exists(path.join(snapshot, 'elc408'))) return entry
    return { from: path.join(snapshot, 'elc408'), to: 'elc408', filter: ['**/*'] }
  })
  for (const name of PERSISTENT_DATA) {
    const from = path.join(snapshot, 'data', name)
    if (exists(from)) config.extraFiles.push({ from, to: `data/${name}`, filter: ['**/*'] })
  }
  // Reuse the installed Electron version. The normal hook, fuses and embedded
  // integrity generation still run, without the Windows archive-rename issue.
  const installedElectron = path.join(projectRoot, 'node_modules', 'electron', 'dist')
  if (exists(installedElectron)) config.electronDist = installedElectron
  return config
}

function prepareBuild(projectRoot) {
  const localRequire = createRequire(path.join(projectRoot, 'package.json'))
  const vite = path.join(path.dirname(localRequire.resolve('vite/package.json')), 'bin', 'vite.js')
  for (const [script, args] of [
    [path.join(projectRoot, 'scripts', 'prepare-portable-resources.cjs'), []],
    [vite, ['build']],
  ]) execFileSync(process.execPath, [script, ...args], { cwd: projectRoot, stdio: 'inherit', windowsHide: true })
}

async function buildRelease({ projectRoot, config, targets }, {
  run = execFileSync, cli = require.resolve('electron-builder/cli.js'),
} = {}) {
  const configPath = inside(projectRoot, path.join(path.dirname(config.directories.output), 'electron-builder.generated.json'))
  requireUnlinkedAncestors(projectRoot, configPath)
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' })
  // Passing an object to build() merges it with electron-builder.json again,
  // duplicating extraResources and racing two copies of each media file.
  // The complete config is the CLI's sole config file. A child-process boundary
  // also prevents unfinished builder work from resetting this process's exit.
  run(process.execPath, [cli, '--config', configPath, '--win', ...targets], {
    cwd: projectRoot, stdio: 'inherit', windowsHide: true,
  })
}

async function verifyRelease(appDirectory) {
  const { verifyPortableProtection } = require('./verify-portable-protection.cjs')
  return verifyPortableProtection(appDirectory)
}

async function rebuildPortable({ projectRoot = path.resolve(__dirname, '..'), target = 'dist',
  probe = runningPackageProcesses, prepare = prepareBuild, build = buildRelease, verify = verifyRelease } = {}) {
  if (!['dir', 'zip', 'dist'].includes(target)) throw new Error('Expected portable rebuild target: dir, zip or dist')
  projectRoot = path.resolve(projectRoot)
  const base = JSON.parse(fs.readFileSync(path.join(projectRoot, 'electron-builder.json'), 'utf8'))
  const release = inside(projectRoot, path.resolve(projectRoot, base.directories?.output || 'release'))
  const source = inside(release, path.join(release, 'win-unpacked'))
  const buildRoot = inside(projectRoot, path.join(projectRoot, '.build'))
  requireUnlinkedAncestors(projectRoot, release)
  requireUnlinkedAncestors(projectRoot, buildRoot)
  requireUnlinkedAncestors(projectRoot, source)
  requireRealDirectory(release)
  requireRealDirectory(buildRoot)
  requireRealDirectory(source)
  fs.mkdirSync(release, { recursive: true })
  fs.mkdirSync(buildRoot, { recursive: true })
  const lock = inside(release, path.join(release, '.portable-rebuild.lock'))
  let lockCreated = false
  let work
  try {
    try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }) } catch (error) {
      if (error.code === 'EEXIST') throw new Error(`已有打包任务或未完成的打包锁：${lock}；确认没有打包进程后再移除该锁。`)
      throw error
    }
    lockCreated = true
    await requireStopped(source, probe)
    work = fs.mkdtempSync(path.join(buildRoot, 'portable-rebuild-'))
    const snapshot = inside(work, path.join(work, 'snapshot'))
    fs.mkdirSync(snapshot)
    const before = await preservedFingerprint(source)
    for (const relative of PRESERVED_ROOTS) {
      const from = path.join(source, relative)
      if (exists(from)) copyTree(from, path.join(snapshot, relative), { workspaceRoot: projectRoot })
    }
    if (!sameManifest(before, await preservedFingerprint(snapshot)) || !sameManifest(before, await preservedFingerprint(source))) {
      throw new Error('旧发行包数据在备份期间发生变化，请关闭相关程序后重试；原目录未修改。')
    }
    fs.writeFileSync(path.join(work, 'snapshot-manifest.json'), JSON.stringify(before, null, 2))
    const output = inside(work, path.join(work, 'output'))
    const config = createBuildConfig(base, snapshot, output, projectRoot)
    const targets = target === 'dir' ? ['dir'] : ['dir', 'zip']
    console.log(`Portable rebuild snapshot: ${snapshot}`)
    await prepare(projectRoot)
    await build({ projectRoot, config, targets })
    const stagedApp = inside(output, path.join(output, 'win-unpacked'))
    requireUnlinkedAncestors(projectRoot, stagedApp)
    await verify(stagedApp)
    await verifyPreservedFiles(snapshot, stagedApp, projectRoot)
    // Builder received only the persistent data whitelist. Refuse an artifact
    // that somehow acquired a machine license or transient Chromium profile.
    for (const forbidden of ['activation', 'logs', 'session']) {
      if (exists(path.join(stagedApp, 'data', forbidden))) throw new Error(`Unexpected runtime data in release staging: ${forbidden}`)
    }
    const archives = fs.readdirSync(output).filter(name => name.endsWith('.zip'))
    if (target !== 'dir' && archives.length !== 1) throw new Error('Expected one rebuilt ZIP archive')
    await requireStopped(source, probe)
    if (!sameManifest(before, await preservedFingerprint(source))) {
      throw new Error('旧发行包数据在构建期间发生变化，已停止发布；原目录与备份均保留。')
    }
    // Keep all existing data in place, including old activation files needed
    // for first-run migration, logs and caches. Do not rename/delete its root.
    // If publishing fails, both the full data backup and staged build remain.
    const hadSourceData = exists(path.join(source, 'data'))
    fs.mkdirSync(source, { recursive: true })
    copyTree(stagedApp, source, { skipData: hadSourceData, workspaceRoot: projectRoot })
    await verify(source)
    for (const name of archives) publishArchive(inside(output, path.join(output, name)), inside(release, path.join(release, name)))
    const result = { passed: true, target, source, work, preserved: PRESERVED_ROOTS.filter(relative => exists(path.join(snapshot, relative))),
      archives: archives.map(name => path.join(release, name)) }
    fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    if (work) {
      fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify({ passed: false, error: error.message, work }, null, 2))
      error.message += `\n备份和构建文件保留于：${work}`
    }
    throw error
  } finally {
    if (lockCreated) fs.unlinkSync(lock)
  }
}

if (require.main === module) {
  rebuildPortable({ target: process.argv[2] || 'dist' }).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { rebuildPortable, createBuildConfig, preservedFingerprint, runningPackageProcesses, publishArchive, buildRelease }
