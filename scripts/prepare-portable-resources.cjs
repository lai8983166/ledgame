const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const frontendRoot = path.resolve(__dirname, '..')
const backendRoot = path.resolve(process.env.BACKEND_DIR || path.join(frontendRoot, '..', 'ledGame-backend'))
const buildResourcesRoot = path.join(frontendRoot, 'build-resources')
const backendResourceDir = path.join(buildResourcesRoot, 'backend')
const jreResourceDir = path.join(buildResourcesRoot, 'jre')
const seedDatabaseResourceDir = path.join(buildResourcesRoot, 'seed-database', 'runtime')
const mediaResourceDir = path.join(buildResourcesRoot, 'media')

const skipExtensions = new Set(['.md'])

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd || frontendRoot,
    shell: options.shell || false,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

function runShell(commandLine, options = {}) {
  const result = childProcess.spawnSync(commandLine, {
    cwd: options.cwd || frontendRoot,
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  })
  if (result.status !== 0) {
    throw new Error(`${commandLine} failed with exit code ${result.status}`)
  }
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true })
}

function removeDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true })
}

function shouldCopyFile(filePath) {
  return !skipExtensions.has(path.extname(filePath).toLowerCase())
}

function copyFiltered(source, target, options = {}) {
  if (!fs.existsSync(source)) {
    if (options.optional) {
      return
    }
    throw new Error(`Required path does not exist: ${source}`)
  }

  const stat = fs.statSync(source)
  if (stat.isFile()) {
    if (shouldCopyFile(source)) {
      ensureDirectory(path.dirname(target))
      fs.copyFileSync(source, target)
    }
    return
  }

  if (!stat.isDirectory()) {
    return
  }

  ensureDirectory(target)
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const childSource = path.join(source, entry.name)
    const childTarget = path.join(target, entry.name)
    if (entry.isDirectory()) {
      copyFiltered(childSource, childTarget, options)
      continue
    }
    if (entry.isFile() && shouldCopyFile(childSource)) {
      ensureDirectory(path.dirname(childTarget))
      fs.copyFileSync(childSource, childTarget)
    }
  }
}

function removeSkippedFiles(directory) {
  if (!fs.existsSync(directory)) {
    return
  }
  const stat = fs.statSync(directory)
  if (stat.isFile()) {
    if (!shouldCopyFile(directory)) {
      fs.rmSync(directory, { force: true })
    }
    return
  }
  if (!stat.isDirectory()) {
    return
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    removeSkippedFiles(path.join(directory, entry.name))
  }
}

function findBackendJar() {
  const targetDir = path.join(backendRoot, 'target')
  if (!fs.existsSync(targetDir)) {
    return null
  }
  const jars = fs.readdirSync(targetDir)
    .filter((name) => name.endsWith('.jar') && !name.endsWith('-sources.jar') && !name.endsWith('-javadoc.jar'))
    .map((name) => path.join(targetDir, name))
    .filter((jarPath) => fs.statSync(jarPath).isFile())
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
  return jars[0] || null
}

function buildBackendJar() {
  const mavenCommand = process.env.MAVEN_CMD || 'mvn'
  runShell(`${mavenCommand} clean package -DskipTests`, { cwd: backendRoot })
  const jarPath = findBackendJar()
  if (!jarPath) {
    throw new Error(`Backend jar was not found under ${path.join(backendRoot, 'target')}`)
  }
  ensureDirectory(backendResourceDir)
  fs.copyFileSync(jarPath, path.join(backendResourceDir, 'ledGame-backend.jar'))
}

function findJavaHome() {
  const candidates = [
    process.env.JRE_SOURCE_DIR,
    process.env.JAVA_HOME,
    path.resolve(process.execPath, '..', '..'),
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function javaBinary(name) {
  return process.platform === 'win32' ? `${name}.exe` : name
}

function prepareJre() {
  removeDirectory(jreResourceDir)
  const explicitJre = process.env.PORTABLE_JRE_DIR
  if (explicitJre) {
    copyFiltered(explicitJre, jreResourceDir)
    return
  }

  const javaHome = findJavaHome()
  if (!javaHome) {
    throw new Error('Set JAVA_HOME, JRE_SOURCE_DIR, or PORTABLE_JRE_DIR before preparing portable resources')
  }

  const jlinkPath = path.join(javaHome, 'bin', javaBinary('jlink'))
  if (fs.existsSync(jlinkPath)) {
    run(jlinkPath, [
      '--add-modules',
      [
        'java.base',
        'java.compiler',
        'java.desktop',
        'java.instrument',
        'java.logging',
        'java.management',
        'java.naming',
        'java.net.http',
        'java.security.jgss',
        'java.sql',
        'java.xml',
        'jdk.crypto.ec',
        'jdk.unsupported',
      ].join(','),
      '--strip-debug',
      '--no-header-files',
      '--no-man-pages',
      '--compress=2',
      '--output',
      jreResourceDir,
    ])
    removeSkippedFiles(jreResourceDir)
    return
  }

  copyFiltered(javaHome, jreResourceDir)
  removeSkippedFiles(jreResourceDir)
}

function prepareSeedDatabase() {
  const sourceRuntimeDir = path.join(backendRoot, 'database', 'runtime')
  removeDirectory(path.join(buildResourcesRoot, 'seed-database'))
  ensureDirectory(seedDatabaseResourceDir)

  if (!fs.existsSync(sourceRuntimeDir)) {
    return
  }

  for (const entry of fs.readdirSync(sourceRuntimeDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.mv.db')) {
      fs.copyFileSync(path.join(sourceRuntimeDir, entry.name), path.join(seedDatabaseResourceDir, entry.name))
    }
  }
}

function prepareMedia() {
  const sourceMediaDir = process.env.MEDIA_SOURCE_DIR || path.join(backendRoot, 'media')
  removeDirectory(mediaResourceDir)
  copyFiltered(sourceMediaDir, mediaResourceDir, { optional: true })
}

function main() {
  if (!fs.existsSync(backendRoot)) {
    throw new Error(`Backend project was not found: ${backendRoot}`)
  }

  removeDirectory(backendResourceDir)
  buildBackendJar()
  prepareJre()
  prepareSeedDatabase()
  prepareMedia()

  console.log(`Portable resources prepared at ${buildResourcesRoot}`)
}

main()
