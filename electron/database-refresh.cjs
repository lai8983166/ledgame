const path = require('node:path')
const defaultFs = require('node:fs/promises')

const DATABASE_FILE_SUFFIXES = Object.freeze(['.mv.db', '.trace.db'])

class DatabaseRefreshError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = 'DatabaseRefreshError'
    this.code = code
    this.backupDirectory = options.backupDirectory || null
    this.restoreError = options.restoreError || null
  }
}

function isManagedDatabaseFile(fileName, databaseName = 'ledgame') {
  return DATABASE_FILE_SUFFIXES.some((suffix) => fileName === `${databaseName}${suffix}`)
}

async function listManagedDatabaseFiles(directory, databaseName = 'ledgame', fs = defaultFs) {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }

  return entries
    .filter((entry) => entry.isFile() && isManagedDatabaseFile(entry.name, databaseName))
    .map((entry) => entry.name)
    .sort()
}

async function assertReadableSeedDatabase(seedDirectory, databaseName = 'ledgame', fs = defaultFs) {
  const files = await listManagedDatabaseFiles(seedDirectory, databaseName, fs)
  const mainFile = `${databaseName}.mv.db`
  if (!files.includes(mainFile)) {
    throw new DatabaseRefreshError(
      'SEED_DATABASE_MISSING',
      `Seed database file not found: ${path.join(seedDirectory, mainFile)}`,
    )
  }

  for (const fileName of files) {
    const filePath = path.join(seedDirectory, fileName)
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile() || stat.size <= 0) {
        throw new Error('empty or invalid database file')
      }
      await fs.access(filePath, 4)
    } catch (error) {
      throw new DatabaseRefreshError(
        'SEED_DATABASE_UNREADABLE',
        `Seed database file is not readable: ${filePath}`,
        { cause: error },
      )
    }
  }

  return files
}

async function assertWritableDirectory(directory, fs = defaultFs) {
  try {
    await fs.mkdir(directory, { recursive: true })
    await fs.access(directory, 2)
  } catch (error) {
    throw new DatabaseRefreshError(
      'TARGET_DATABASE_UNWRITABLE',
      `User database directory is not writable: ${directory}`,
      { cause: error },
    )
  }
}

function formatTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  const pad = (number) => String(number).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

async function createBackupDirectory(backupRoot, timestamp, fs = defaultFs) {
  await fs.mkdir(backupRoot, { recursive: true })
  const baseName = formatTimestamp(timestamp)
  let candidate = path.join(backupRoot, baseName)
  let suffix = 1
  while (true) {
    try {
      await fs.mkdir(candidate)
      return candidate
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error
      }
      candidate = path.join(backupRoot, `${baseName}-${suffix}`)
      suffix += 1
    }
  }
}

async function copyFiles(fileNames, sourceDirectory, targetDirectory, fs = defaultFs) {
  for (const fileName of fileNames) {
    await fs.copyFile(
      path.join(sourceDirectory, fileName),
      path.join(targetDirectory, fileName),
    )
  }
}

async function removeFiles(fileNames, directory, fs = defaultFs) {
  for (const fileName of fileNames) {
    await fs.rm(path.join(directory, fileName), { force: true })
  }
}

async function restoreDatabaseFiles({
  userDatabaseRuntimeDir,
  backupDirectory,
  databaseName = 'ledgame',
  fs = defaultFs,
}) {
  if (!backupDirectory) {
    throw new DatabaseRefreshError('BACKUP_NOT_FOUND', 'No database backup is available for restore')
  }

  const backupFiles = await listManagedDatabaseFiles(backupDirectory, databaseName, fs)
  const currentFiles = await listManagedDatabaseFiles(userDatabaseRuntimeDir, databaseName, fs)
  await removeFiles(currentFiles, userDatabaseRuntimeDir, fs)
  await copyFiles(backupFiles, backupDirectory, userDatabaseRuntimeDir, fs)
  return { restoredFiles: backupFiles }
}

async function refreshDatabaseFiles({
  userDatabaseRuntimeDir,
  seedDatabaseRuntimeDir,
  backupRoot,
  databaseName = 'ledgame',
  now = new Date(),
  fs = defaultFs,
}) {
  await assertWritableDirectory(userDatabaseRuntimeDir, fs)
  const seedFiles = await assertReadableSeedDatabase(seedDatabaseRuntimeDir, databaseName, fs)
  const currentFiles = await listManagedDatabaseFiles(userDatabaseRuntimeDir, databaseName, fs)
  let backupDirectory = null

  try {
    backupDirectory = await createBackupDirectory(backupRoot, now, fs)
    await copyFiles(currentFiles, userDatabaseRuntimeDir, backupDirectory, fs)
  } catch (error) {
    throw new DatabaseRefreshError(
      'BACKUP_FAILED',
      `Unable to back up the current database: ${error.message || String(error)}`,
      { backupDirectory, cause: error },
    )
  }

  const stagingDirectory = await fs.mkdtemp(path.join(userDatabaseRuntimeDir, '.database-refresh-'))
  try {
    await copyFiles(seedFiles, seedDatabaseRuntimeDir, stagingDirectory, fs)
    await removeFiles(currentFiles, userDatabaseRuntimeDir, fs)
    await copyFiles(seedFiles, stagingDirectory, userDatabaseRuntimeDir, fs)
    return {
      backupDirectory,
      replacedFiles: seedFiles,
    }
  } catch (error) {
    let restoreError = null
    try {
      await restoreDatabaseFiles({
        userDatabaseRuntimeDir,
        backupDirectory,
        databaseName,
        fs,
      })
    } catch (restoreFailure) {
      restoreError = restoreFailure
    }
    throw new DatabaseRefreshError(
      restoreError ? 'RESTORE_FAILED' : 'REPLACE_FAILED',
      restoreError
        ? `Database replacement failed and restore also failed: ${restoreError.message || String(restoreError)}`
        : `Database replacement failed: ${error.message || String(error)}`,
      { backupDirectory, cause: error, restoreError },
    )
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true })
  }
}

module.exports = {
  DATABASE_FILE_SUFFIXES,
  DatabaseRefreshError,
  assertReadableSeedDatabase,
  isManagedDatabaseFile,
  listManagedDatabaseFiles,
  refreshDatabaseFiles,
  restoreDatabaseFiles,
}
