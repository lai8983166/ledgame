const fs = require('node:fs')
const path = require('node:path')
const { createPublicKey } = require('node:crypto')

function verifyActivationPublicKey(backendRoot) {
  const file = path.join(backendRoot, 'src', 'main', 'resources', 'activation-public.pem')
  if (!fs.existsSync(file)) throw new Error('游戏端缺少厂家授权公钥，请先配置 activation-public.pem')
  const pem = fs.readFileSync(file, 'utf8')
  if (pem.includes('PRIVATE KEY') || !pem.includes('BEGIN PUBLIC KEY')) throw new Error('游戏端只能打包厂家公钥')
  const key = createPublicKey(pem)
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('游戏端授权公钥必须是 Ed25519')
  return file
}

module.exports = { verifyActivationPublicKey }
