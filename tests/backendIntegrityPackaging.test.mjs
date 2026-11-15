import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const beforePack = require('../scripts/prepare-backend-integrity.cjs')

async function fixture(t) {
  const appDir = await mkdtemp(path.join(tmpdir(), 'ledgame-package-integrity-'))
  t.after(() => rm(appDir, { recursive: true, force: true }))
  const jar = path.join(appDir, 'build-resources', 'backend', 'ledGame-backend.jar')
  const manifest = path.join(appDir, 'electron', 'backend-integrity.generated.cjs')
  await mkdir(path.dirname(jar), { recursive: true })
  await mkdir(path.dirname(manifest), { recursive: true })
  return { appDir, jar, manifest }
}

async function readManifest(file) {
  const context = { module: { exports: {} } }
  vm.runInNewContext(await readFile(file, 'utf8'), context)
  return context.module.exports
}

test('beforePack refreshes the trusted hash from the current staged backend on every build', async (t) => {
  const { appDir, jar, manifest } = await fixture(t)
  for (const contents of ['first backend build', 'second backend build']) {
    await writeFile(jar, contents)
    await beforePack({ packager: { info: { appDir } } })
    assert.equal((await readManifest(manifest)).jarSha256,
      createHash('sha256').update(contents).digest('hex'))
  }
})

test('a missing or empty staged backend stops packaging and removes a stale manifest', async (t) => {
  const { appDir, jar, manifest } = await fixture(t)
  for (const emptyFile of [false, true]) {
    await writeFile(manifest, "module.exports = { jarSha256: 'stale' }\n")
    if (emptyFile) await writeFile(jar, '')
    await assert.rejects(beforePack({ packager: { info: { appDir } } }), /Cannot prepare packaged backend integrity/)
    assert.equal(existsSync(manifest), false)
  }
})

test('packaging rejects a directory at the backend jar path', async (t) => {
  const { appDir, jar, manifest } = await fixture(t)
  await mkdir(jar)
  await assert.rejects(beforePack({ packager: { info: { appDir } } }), /not a nonempty file/)
  assert.equal(existsSync(manifest), false)
})

test('the release configuration combines ASAR validation with restricted Electron startup', () => {
  const config = JSON.parse(readFileSync(new URL('../electron-builder.json', import.meta.url), 'utf8'))
  assert.equal(config.asar, true)
  assert.equal(config.beforePack, 'scripts/prepare-backend-integrity.cjs')
  assert.deepEqual(config.electronFuses, {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  })
  assert.ok(config.files.includes('electron/**/*'))
})
