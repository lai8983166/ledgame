import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder'))
const packagingRequire = createRequire(builderRequire.resolve('app-builder-lib'))
const asar = packagingRequire('@electron/asar')
const { Data, NtExecutable, NtExecutableResource, Resource } = packagingRequire('resedit')
const { verifyPortableProtection } = require('../scripts/verify-portable-protection.cjs')
const { writeBackendIntegrity } = require('../scripts/prepare-backend-integrity.cjs')
const preparePlayExecutable = require('../scripts/prepare-play-executable.cjs')
const { standardExecutable, playExecutable } = preparePlayExecutable
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const projectDir = fileURLToPath(new URL('..', import.meta.url))
const fuseSentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX')

async function fixture(t, { unsafeFuse = false, wrongHeader = false, executableManifest = false } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ledgame-verify-protection-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const source = path.join(directory, 'source')
  const output = path.join(directory, 'output')
  const asarPath = path.join(output, 'resources', 'app.asar')
  const jar = path.join(output, 'resources', 'backend', 'ledGame-backend.jar')
  await mkdir(path.dirname(jar), { recursive: true })
  await mkdir(path.join(source, 'build-resources', 'backend'), { recursive: true })
  await writeFile(jar, 'trusted backend fixture')
  await writeFile(path.join(source, 'build-resources', 'backend', 'ledGame-backend.jar'), await readFile(jar))
  await writeBackendIntegrity(source)
  const manifest = path.join(source, 'electron', 'backend-integrity.generated.cjs')
  if (executableManifest) await writeFile(manifest, 'process.exit(0)\nmodule.exports = {}\n')
  await asar.createPackage(source, asarPath)

  // A tiny valid PE plus Electron's documented fuse wire avoids copying/running Electron in tests.
  const executable = NtExecutable.createEmpty(false)
  executable.setExtraData(Buffer.concat([
    fuseSentinel,
    Buffer.from([1, 8, unsafeFuse ? 49 : 48, 48, 48, 48, 49, 49, 48, 49]),
  ]))
  const resource = NtExecutableResource.from(executable)
  resource.entries.push({
    type: 'INTEGRITY', id: 'ELECTRONASAR', lang: 1033, codepage: 1200,
    bin: Buffer.from(JSON.stringify([{
      file: 'resources\\app.asar', alg: 'SHA256',
      value: wrongHeader ? '0'.repeat(64) : sha256(asar.getRawHeader(asarPath).headerString),
    }])),
  })
  const icon = Data.IconFile.from(await readFile(path.join(projectDir, standardExecutable.icon)))
  Resource.IconGroupEntry.replaceIconsForResource(resource.entries, 1, 1033, icon.icons.map(item => item.data))
  resource.outputResource(executable)
  const standardPath = path.join(output, standardExecutable.name)
  const playPath = path.join(output, playExecutable.name)
  const primaryBytes = Buffer.from(executable.generate())
  await writeFile(standardPath, primaryBytes)
  const signed = []
  await preparePlayExecutable({
    appOutDir: output,
    electronPlatformName: 'win32',
    packager: { projectDir, signIf: async (file) => { signed.push(file) } },
  })
  assert.deepEqual(signed, [playPath])
  assert.deepEqual(await readFile(standardPath), primaryBytes)
  return { output, jar, asarPath, standardPath, playPath }
}

test('the read-only verifier accepts both protected and distinctly branded EXEs repeatedly', async (t) => {
  const { output, asarPath } = await fixture(t)
  const original = await readFile(asarPath)
  for (let index = 0; index < 2; index++) {
    const { executableCount, fuseCount } = await verifyPortableProtection(output)
    assert.equal(executableCount, 2)
    assert.equal(fuseCount, 5)
  }
  assert.deepEqual(await readFile(asarPath), original)
})

test('the verifier rejects unsafe fuses and incorrect embedded ASAR hashes', async (t) => {
  const unsafe = await fixture(t, { unsafeFuse: true })
  await assert.rejects(verifyPortableProtection(unsafe.output), /Unsafe Electron fuse: RunAsNode/)
  const wrong = await fixture(t, { wrongHeader: true })
  await assert.rejects(verifyPortableProtection(wrong.output), /Embedded ASAR header hash/)
})

test('the verifier rejects a missing play EXE or one still using the primary icon', async (t) => {
  const { output, standardPath, playPath } = await fixture(t)
  await writeFile(playPath, await readFile(standardPath))
  await assert.rejects(verifyPortableProtection(output), /LED Game Play\.exe: Embedded Windows application icon does not match/)
  await rm(playPath)
  await assert.rejects(verifyPortableProtection(output), /LED Game Play\.exe:.*ENOENT/)
})

test('the verifier checks fuses on the play executable independently', async (t) => {
  const { output, playPath } = await fixture(t)
  const bytes = await readFile(playPath)
  const offset = bytes.indexOf(fuseSentinel)
  assert.ok(offset >= 0)
  bytes[offset + fuseSentinel.length + 2] = 49
  await writeFile(playPath, bytes)
  await assert.rejects(verifyPortableProtection(output), /LED Game Play\.exe: Unsafe Electron fuse: RunAsNode/)
})

test('the verifier rejects a replaced external JAR', async (t) => {
  const { output, jar } = await fixture(t)
  await writeFile(jar, 'replaced backend')
  await assert.rejects(verifyPortableProtection(output), /backend JAR does not match/)
})

test('the verifier rejects executable manifest code without running it', async (t) => {
  const { output } = await fixture(t, { executableManifest: true })
  await assert.rejects(verifyPortableProtection(output), /Invalid generated backend integrity manifest/)
})

test('the verifier rejects manifest bytes changed without changing the protected header', async (t) => {
  const { output, asarPath } = await fixture(t)
  const bytes = await readFile(asarPath)
  const data = asar.extractFile(asarPath, 'electron/backend-integrity.generated.cjs')
  const offset = bytes.indexOf(data)
  assert.ok(offset >= 0)
  bytes[offset] = 32
  await writeFile(asarPath, bytes)
  await assert.rejects(verifyPortableProtection(output), /manifest content does not match/)
})
