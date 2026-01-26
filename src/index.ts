import { Hono } from 'hono'
import type { Env } from './types'
import { setupRoutes } from './routes'

export { Room } from './durable-objects/room.do'

const app = new Hono<{ Bindings: Env }>()

setupRoutes(app)

export default app
