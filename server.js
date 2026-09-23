import { app } from './server/api.js'

const PORT = 3001
// Loopback only: on a shared network (café or hotel Wi-Fi…), listening on every
// interface would let other machines use this API as an open Yahoo proxy.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
