const path = require('node:path')

const gameExecutableName = 'LED Game Play.exe'

function executableStartsGame(isPackaged, executablePath) {
  return isPackaged && path.win32.basename(executablePath).toLowerCase() === gameExecutableName.toLowerCase()
}

module.exports = { executableStartsGame, gameExecutableName }
