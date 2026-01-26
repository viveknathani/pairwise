// Room Durable Object - Manages a two-person collaborative drawing room

import type { Stroke, ClientMessage, ServerMessage, Env } from '../types'
import roomService from '../services/RoomService'

export class Room {
  private state: DurableObjectState
  private env: Env
  private activeStrokes: Map<string, Stroke> // In-progress strokes (strokeId → Stroke)
  private createdAt: number

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.activeStrokes = new Map()
    this.createdAt = Date.now()

    // Set up 1-hour TTL alarm on initialization
    this.state.blockConcurrencyWhile(async () => {
      await roomService.setupTTLAlarm(this.state.storage)
    })
  }

  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade request
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    // Check if room is full (max 2 users)
    const currentSessions = this.state.getWebSockets()
    if (currentSessions.length >= 2) {
      // Room is full, reject connection
      server.accept()
      server.send(JSON.stringify({ type: 'room_full' }))
      server.close(1000, 'Room is full')
      return new Response(null, { status: 101, webSocket: client })
    }

    // Accept the WebSocket connection
    this.state.acceptWebSocket(server)

    // If room was empty, restore TTL alarm
    if (currentSessions.length === 0) {
      await roomService.restoreTTLAlarm(this.state.storage)
    }

    // Send current user count and assign role
    const userCount = this.state.getWebSockets().length
    const role = userCount === 1 ? 'initiator' : 'responder'
    console.log(`New user connected! Total users: ${userCount}, role: ${role}`)
    server.send(JSON.stringify({ type: 'joined', userCount, yourRole: role }))

    // Send full canvas state (all persisted strokes)
    const strokes = await this.loadStrokes()
    console.log(`Sending ${strokes.length} persisted strokes to new user`)
    server.send(JSON.stringify({ type: 'full_state', strokes }))

    // Notify other users that someone joined
    console.log(`Broadcasting user_joined to ${userCount - 1} other users`)
    this.broadcast({ type: 'user_joined', userCount }, server)

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return

    try {
      const msg: ClientMessage = JSON.parse(message)
      console.log('Received WebSocket message:', msg.type, 'from', ws)

      switch (msg.type) {
        case 'join':
          // Already handled in fetch()
          break

        case 'stroke_start':
          // Start a new stroke
          const newStroke: Stroke = {
            id: msg.strokeId,
            tool: msg.tool as 'pen' | 'eraser',
            color: msg.color,
            points: [{ x: msg.x, y: msg.y }],
            timestamp: Date.now(),
          }
          this.activeStrokes.set(msg.strokeId, newStroke)

          // Broadcast to peers
          this.broadcast(
            {
              type: 'stroke_update',
              strokeId: msg.strokeId,
              tool: newStroke.tool,
              color: newStroke.color,
              points: newStroke.points,
            },
            ws
          )
          break

        case 'stroke_move':
          // Add point to existing stroke
          const stroke = this.activeStrokes.get(msg.strokeId)
          if (stroke) {
            stroke.points.push({ x: msg.x, y: msg.y })

            // Broadcast to peers
            this.broadcast(
              {
                type: 'stroke_update',
                strokeId: msg.strokeId,
                tool: stroke.tool,
                color: stroke.color,
                points: stroke.points,
              },
              ws
            )
          }
          break

        case 'stroke_end':
          // Complete the stroke and persist it
          const completedStroke = this.activeStrokes.get(msg.strokeId)
          if (completedStroke) {
            // Persist to storage
            await this.saveStroke(completedStroke)

            // Broadcast completed stroke to peers
            this.broadcast(
              {
                type: 'stroke_broadcast',
                stroke: completedStroke,
              },
              ws
            )

            // Remove from active strokes
            this.activeStrokes.delete(msg.strokeId)
          }
          break

        case 'webrtc_offer':
          // Forward WebRTC offer to the other peer
          console.log('Forwarding WebRTC offer from', msg.userId)
          this.broadcast(
            {
              type: 'webrtc_offer',
              offer: msg.offer,
              userId: msg.userId,
            },
            ws
          )
          break

        case 'webrtc_answer':
          // Forward WebRTC answer to the other peer
          console.log('Forwarding WebRTC answer from', msg.userId)
          this.broadcast(
            {
              type: 'webrtc_answer',
              answer: msg.answer,
              userId: msg.userId,
            },
            ws
          )
          break

        case 'webrtc_ice_candidate':
          // Forward ICE candidate to the other peer
          console.log('Forwarding ICE candidate from', msg.userId)
          this.broadcast(
            {
              type: 'webrtc_ice_candidate',
              candidate: msg.candidate,
              userId: msg.userId,
            },
            ws
          )
          break
      }
    } catch (error) {
      console.error('Error processing message:', error)
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // WebSocket automatically removed by Durable Objects runtime
    ws.close(code, reason)

    // Notify remaining users
    const userCount = this.state.getWebSockets().length
    console.log(`User disconnected! Remaining users: ${userCount}`)
    this.broadcast({ type: 'user_left', userCount })

    // If room is empty, schedule cleanup
    if (userCount === 0) {
      await roomService.scheduleEmptyRoomCleanup(this.state.storage)
    }
  }

  async alarm(): Promise<void> {
    const userCount = this.state.getWebSockets().length
    const shouldCleanup = await roomService.handleAlarm(this.state.storage, userCount)

    if (!shouldCleanup) {
      return
    }

    // Clean up room
    console.log('Room alarm triggered, deleting all data')
    await roomService.cleanupRoom(this.state.storage)
    this.state.getWebSockets().forEach((session) => {
      session.close(1000, 'Room expired')
    })
    this.activeStrokes.clear()
  }

  // Helper: Broadcast message to all connected clients except sender
  private broadcast(message: ServerMessage, except?: WebSocket): void {
    const messageStr = JSON.stringify(message)
    const sessions = this.state.getWebSockets()
    console.log(`Broadcasting to ${sessions.length} sessions (except sender):`, message.type)
    sessions.forEach((session) => {
      if (session !== except) {
        try {
          session.send(messageStr)
          console.log('Message sent successfully!')
        } catch (error) {
          console.error('Failed to send message:', error)
        }
      }
    })
  }

  // Helper: Load all persisted strokes from storage
  private async loadStrokes(): Promise<Stroke[]> {
    return roomService.loadStrokes(this.state.storage)
  }

  // Helper: Save a completed stroke to storage
  private async saveStroke(stroke: Stroke): Promise<void> {
    await roomService.saveStroke(this.state.storage, stroke)
  }
}
