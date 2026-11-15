const net = require('node:net')

// The backend must receive the port of this still-bound listener. Probing and
// closing a port first leaves a race with other local applications.
function createDebugFrameServer({ isActivated, onPayload, onWarning = () => {} }) {
  let server = null
  let starting = null
  const sockets = new Set()
  function disconnect() {
    for (const socket of sockets) socket.destroy()
    sockets.clear()
  }
  function listen(preferredPort, allowFallback = false) {
    if (server?.listening) return Promise.resolve(server.address().port)
    if (starting) return starting
    const candidate = net.createServer(socket => {
      if (!isActivated()) { socket.destroy(); return }
      sockets.add(socket)
      let buffer = Buffer.alloc(0)
      socket.on('data', chunk => {
        if (!isActivated()) { socket.destroy(); return }
        buffer = Buffer.concat([buffer, chunk])
        let offset = 0
        while (buffer.length - offset >= 5) {
          if (buffer[offset] !== 0x67) { offset++; continue }
          const length = buffer.readUInt32BE(offset + 1)
          const end = offset + 5 + length
          if (buffer.length < end) break
          onPayload(buffer.subarray(offset + 5, end))
          offset = end
        }
        buffer = buffer.subarray(offset)
      })
      socket.on('error', error => {
        if (!['ECONNRESET', 'ECONNABORTED'].includes(error.code)) onWarning(error)
      })
      socket.on('close', () => sockets.delete(socket))
    })
    server = candidate
    starting = new Promise((resolve, reject) => {
      let fallback = false
      candidate.on('error', error => {
        if (allowFallback && !fallback && error.code === 'EADDRINUSE') {
          fallback = true
          candidate.listen(0, '127.0.0.1')
        } else { server = null; reject(error) }
      })
      candidate.once('listening', () => resolve(candidate.address().port))
      candidate.listen(preferredPort, '127.0.0.1')
    }).finally(() => { starting = null })
    return starting
  }
  async function close() {
    disconnect()
    if (starting) { try { await starting } catch { return } }
    const current = server
    server = null
    if (!current?.listening) return
    await new Promise((resolve, reject) => current.close(error => error ? reject(error) : resolve()))
  }
  return { listen, disconnect, close }
}
module.exports = { createDebugFrameServer }
