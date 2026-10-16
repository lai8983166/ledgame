const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

function gameId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('游戏 ID 不合法')
  return id
}

async function exportGameRecord({ id, request, chooseFile, io = fs }) {
  const result = await request(`/games/${gameId(id)}/export`)
  const game = result?.data
  if (!game || typeof game !== 'object' || Array.isArray(game) || !game.id) throw new Error('无法读取完整游戏记录')
  const chosen = await chooseFile({ title: '导出游戏', defaultPath: `${String(game.name || 'game').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.game.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (chosen.canceled || !chosen.filePath) return { canceled: true }
  const temporary = path.join(path.dirname(chosen.filePath), `.${path.basename(chosen.filePath)}.${crypto.randomUUID()}.tmp`)
  try {
    await io.writeFile(temporary, JSON.stringify(game, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
    await io.rename(temporary, chosen.filePath)
  } finally { await io.rm(temporary, { force: true }).catch(() => {}) }
  return { canceled: false }
}

async function importGameRecord({ family, request, chooseFile, io = fs }) {
  if (!['entertainment', 'ranked'].includes(family)) throw new Error('请选择娱乐挑战或排位赛')
  const chosen = await chooseFile({ title: '导入游戏', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (chosen.canceled || !chosen.filePaths?.length) return { canceled: true }
  const file = chosen.filePaths[0]
  const info = await io.stat(file)
  if (!info.isFile() || info.size === 0) throw new Error('请选择有效的游戏 JSON 文件')
  let game
  try { game = JSON.parse((await io.readFile(file, 'utf8')).replace(/^\uFEFF/, '')) }
  catch { throw new Error('游戏 JSON 文件无法解析') }
  if (!game || typeof game !== 'object' || Array.isArray(game) || !game.type || typeof game.levels !== 'string')
    throw new Error('请选择包含一条完整游戏记录的 JSON 文件，不是关卡文件')
  const result = await request('/games/import', { method: 'POST', body: JSON.stringify({ family, game }) })
  if (!result?.data?.id) throw new Error('导入游戏失败')
  return { canceled: false, game: result.data }
}

module.exports = { gameId, exportGameRecord, importGameRecord }
