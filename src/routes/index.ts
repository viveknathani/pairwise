import type { Hono } from 'hono'
import type { Env } from '../types'
import controllers from '../controllers'

export function setupRoutes(app: Hono<{ Bindings: Env }>) {
  app.get('/', controllers.handleIndexPage)
  app.post('/room', controllers.handleCreateRoom)
  app.get('/room/:id/ws', controllers.handleRoomWebSocket)
  app.get('/room/:id', controllers.handleRoomPage)
  app.get('*', controllers.handleStaticAsset)
}

export default { setupRoutes }
