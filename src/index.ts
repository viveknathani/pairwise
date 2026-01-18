import { Hono } from 'hono'

// Export Room Durable Object
export { Room } from './room'

interface Env {
  ROOM: DurableObjectNamespace
  REALTIME_SFU_API_KEY: string
  REALTIME_APP_ID?: string  // Optional: Cloudflare Realtime App ID
  ASSETS: {
    fetch: (request: Request) => Promise<Response>
  }
}

const app = new Hono<{ Bindings: Env }>()

// Debug middleware
app.use('*', async (c, next) => {
  console.log(`${c.req.method} ${c.req.path}`)
  await next()
})

// Serve landing page
app.get('/', async (c) => {
  const indexRequest = new Request(`${new URL(c.req.url).origin}/index.html`)
  return c.env.ASSETS.fetch(indexRequest)
})

// Create new room
app.post('/room', async (c) => {
  console.log('POST /room handler called!')
  const roomId = generateRoomId()
  const url = `${new URL(c.req.url).origin}/room/${roomId}`
  return c.json({ roomId, url })
})

// WebSocket upgrade for room
app.get('/room/:id/ws', async (c) => {
  const roomId = c.req.param('id')

  // Validate room ID
  if (!/^[a-z0-9]{6}$/i.test(roomId)) {
    return c.text('Invalid room ID', 400)
  }

  // Get Durable Object stub for this room
  const id = c.env.ROOM.idFromName(roomId)
  const stub = c.env.ROOM.get(id)

  // Forward the request to the Durable Object
  return stub.fetch(c.req.raw)
})

// Serve room interface HTML
app.get('/room/:id', async (c) => {
  const roomId = c.req.param('id')

  // Validate room ID format (6 alphanumeric characters)
  if (!/^[a-z0-9]{6}$/i.test(roomId)) {
    return c.text('Invalid room ID', 400)
  }

  // Serve room.html from assets
  const roomRequest = new Request(`${new URL(c.req.url).origin}/room.html`, {
    method: 'GET'
  })
  return c.env.ASSETS.fetch(roomRequest)
})

// Fallback to assets for all other GET requests (HTML, CSS, JS files)
app.get('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

// Helper: Generate random room ID
function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Helper: Generate SFU token (placeholder implementation)
async function generateSFUToken(roomId: string, apiKey: string): Promise<string> {
  // TODO: Implement actual Cloudflare Realtime SFU token generation
  // This is a placeholder - real implementation will call Cloudflare's API
  // For now, return a dummy token that includes the room ID
  return `sfu-token-${roomId}-${Date.now()}`
}

export default app
