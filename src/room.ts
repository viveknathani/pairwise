// Room Durable Object - Manages a two-person collaborative drawing room

interface Stroke {
  id: string
  tool: 'pen' | 'eraser'
  color: string
  points: Array<{ x: number; y: number }>
  timestamp: number
}

interface Point {
  x: number
  y: number
}

// Client → Server messages
type ClientMessage =
  | { type: 'join' }
  | { type: 'stroke_start'; strokeId: string; tool: string; color: string; x: number; y: number }
  | { type: 'stroke_move'; strokeId: string; x: number; y: number }
  | { type: 'stroke_end'; strokeId: string }
  | { type: 'webrtc_offer'; offer: RTCSessionDescriptionInit; userId: string }
  | { type: 'webrtc_answer'; answer: RTCSessionDescriptionInit; userId: string }
  | { type: 'webrtc_ice_candidate'; candidate: RTCIceCandidateInit; userId: string }

// Server → Client messages
type ServerMessage =
  | { type: 'joined'; userCount: number }
  | { type: 'full_state'; strokes: Stroke[] }
  | { type: 'user_joined'; userCount: number }
  | { type: 'user_left'; userCount: number }
  | { type: 'room_full' }
  | { type: 'stroke_broadcast'; stroke: Stroke }
  | { type: 'stroke_update'; strokeId: string; tool: string; color: string; points: Point[] }
  | { type: 'sfu_track_available'; userId: string; sessionId: string; trackId: string }

interface SFUSession {
  sessionId: string
  userId: string
  trackId?: string
}

interface RoomSFUSession {
  sessionId: string
  createdAt: number
}

export class Room {
  private state: DurableObjectState
  private env: any
  private activeStrokes: Map<string, Stroke>  // In-progress strokes (strokeId → Stroke)
  private createdAt: number
  private sfuSessions: Map<string, SFUSession>  // userId → session info

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
    this.activeStrokes = new Map()
    this.sfuSessions = new Map()
    this.createdAt = Date.now()

    // Set up 1-hour TTL alarm on initialization
    this.state.blockConcurrencyWhile(async () => {
      const existingAlarm = await this.state.storage.getAlarm()
      if (!existingAlarm) {
        // Set alarm for 1 hour from now
        await this.state.storage.setAlarm(Date.now() + 3600000)
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Handle SFU session creation
    if (url.pathname.endsWith('/sfu/session') && request.method === 'POST') {
      return this.handleCreateSFUSession(request)
    }

    // Handle SFU offer/answer
    if (url.pathname.endsWith('/sfu/offer') && request.method === 'POST') {
      return this.handleSFUOffer(request)
    }

    // Handle SFU renegotiation (for adding remote tracks)
    if (url.pathname.endsWith('/sfu/renegotiate') && request.method === 'POST') {
      return this.handleSFURenegotiate(request)
    }

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

    // Send current user count
    const userCount = this.state.getWebSockets().length
    console.log(`New user connected! Total users: ${userCount}`)
    server.send(JSON.stringify({ type: 'joined', userCount }))

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
            timestamp: Date.now()
          }
          this.activeStrokes.set(msg.strokeId, newStroke)

          // Broadcast to peers
          this.broadcast({
            type: 'stroke_update',
            strokeId: msg.strokeId,
            tool: newStroke.tool,
            color: newStroke.color,
            points: newStroke.points
          }, ws)
          break

        case 'stroke_move':
          // Add point to existing stroke
          const stroke = this.activeStrokes.get(msg.strokeId)
          if (stroke) {
            stroke.points.push({ x: msg.x, y: msg.y })

            // Broadcast to peers
            this.broadcast({
              type: 'stroke_update',
              strokeId: msg.strokeId,
              tool: stroke.tool,
              color: stroke.color,
              points: stroke.points
            }, ws)
          }
          break

        case 'stroke_end':
          // Complete the stroke and persist it
          const completedStroke = this.activeStrokes.get(msg.strokeId)
          if (completedStroke) {
            // Persist to storage
            await this.saveStroke(completedStroke)

            // Broadcast completed stroke to peers
            this.broadcast({
              type: 'stroke_broadcast',
              stroke: completedStroke
            }, ws)

            // Remove from active strokes
            this.activeStrokes.delete(msg.strokeId)
          }
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
      console.log('Room empty, scheduling cleanup in 5 minutes')
      await this.state.storage.setAlarm(Date.now() + 300000)
    }
  }

  async alarm(): Promise<void> {
    // TTL expired or room has been empty - clean up
    console.log('Room TTL expired or cleanup triggered, deleting all data')

    // Delete all persisted strokes
    await this.state.storage.deleteAll()

    // Close any remaining connections
    this.state.getWebSockets().forEach(session => {
      session.close(1000, 'Room expired')
    })
    this.activeStrokes.clear()
  }

  // SFU Session Management
  private async handleCreateSFUSession(request: Request): Promise<Response> {
    try {
      const { userId } = await request.json()
      const appId = this.env.REALTIME_APP_ID || 'YOUR_APP_ID'

      console.log(`Creating SFU session for user ${userId}`)

      // Call Cloudflare's /sessions/new endpoint to create a real session
      const sessionResponse = await fetch(
        `https://rtc.live.cloudflare.com/v1/apps/${appId}/sessions/new`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.env.REALTIME_SFU_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!sessionResponse.ok) {
        const errorBody = await sessionResponse.text()
        console.error('Failed to create SFU session:', sessionResponse.status, errorBody)
        throw new Error(`Failed to create session: ${sessionResponse.status} - ${errorBody}`)
      }

      // The API returns the created session with a sessionId
      const sessionData = await sessionResponse.json()
      console.log('SFU session created:', JSON.stringify(sessionData, null, 2))

      // Extract sessionId from response (exact field name may vary, check response)
      const sessionId = sessionData.sessionId || sessionData.id || sessionData.session?.sessionId

      if (!sessionId) {
        throw new Error('No sessionId in response from /sessions/new')
      }

      // Store session info
      this.sfuSessions.set(userId, {
        sessionId,
        userId
      })

      console.log(`Created SFU session ${sessionId} for user ${userId}`)

      // Get existing peer's track ID if available
      const peerTracks = Array.from(this.sfuSessions.values())
        .filter(s => s.userId !== userId && s.trackId)
        .map(s => ({ userId: s.userId, sessionId: s.sessionId, trackId: s.trackId }))

      return new Response(JSON.stringify({
        sessionId,
        appId,
        peerTracks
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Failed to create SFU session:', error)
      return new Response(JSON.stringify({ error: 'Failed to create session' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  private async handleSFUOffer(request: Request): Promise<Response> {
    try {
      const { userId, offer } = await request.json()
      console.log('Handling SFU offer for user:', userId)

      const session = this.sfuSessions.get(userId)
      if (!session) {
        throw new Error('Session not found')
      }

      const appId = this.env.REALTIME_APP_ID || 'YOUR_APP_ID'

      // Extract mid from SDP offer
      const midMatch = offer.sdp.match(/a=mid:(\S+)/)
      const mid = midMatch ? midMatch[1] : '0'
      console.log('Extracted mid from SDP:', mid)

      const requestBody = {
        sessionDescription: offer,
        tracks: [{
          location: 'local',
          mid: mid,
          trackName: `audio-${userId}`,
          bidirectionalMediaStream: true,  // Allow this track to be pulled by peers
          kind: 'audio'  // Specify track type (undocumented field)
        }]
      }

      console.log('Calling SFU API with:', JSON.stringify(requestBody, null, 2))

      // Call Cloudflare Realtime API with offer to get answer and create track
      const trackResponse = await fetch(
        `https://rtc.live.cloudflare.com/v1/apps/${appId}/sessions/${session.sessionId}/tracks/new`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.env.REALTIME_SFU_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      )

      if (!trackResponse.ok) {
        const errorBody = await trackResponse.text()
        console.error('SFU API error response:', trackResponse.status, errorBody)
        throw new Error(`SFU API error: ${trackResponse.status} - ${errorBody}`)
      }

      const trackData = await trackResponse.json()
      console.log('SFU API response:', JSON.stringify(trackData, null, 2))

      // Store track info - use trackName as the identifier
      const publishedTrack = trackData.tracks?.[0]
      session.trackId = publishedTrack?.trackName || `audio-${userId}`
      this.sfuSessions.set(userId, session)

      console.log('Published track successfully:', session.trackId)

      // Notify other WebSocket clients about new track
      this.broadcast({
        type: 'sfu_track_available',
        userId,
        sessionId: session.sessionId,
        trackId: session.trackId,
        trackName: session.trackId  // trackName is what we need to pull
      } as any)

      return new Response(JSON.stringify({
        answer: trackData.sessionDescription,
        trackId: session.trackId
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Failed to handle SFU offer:', error)
      return new Response(JSON.stringify({
        error: 'Failed to negotiate',
        details: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  private async handleSFURenegotiate(request: Request): Promise<Response> {
    try {
      const { userId, offer, peerSessionId, peerTrackName } = await request.json()
      console.log('Handling SFU renegotiation for user:', userId)
      console.log('Adding remote track:', peerTrackName, 'from session:', peerSessionId)

      const session = this.sfuSessions.get(userId)
      if (!session) {
        throw new Error('Session not found')
      }

      const appId = this.env.REALTIME_APP_ID || 'YOUR_APP_ID'

      // Extract mid from SDP offer
      const midMatches = offer.sdp.match(/a=mid:(\S+)/g)
      const mids = midMatches ? midMatches.map((m: string) => m.split(':')[1]) : []
      const remoteMid = mids[mids.length - 1] || '1' // Get the last mid (newest transceiver)
      console.log('Extracted mid for remote track:', remoteMid)

      const requestBody = {
        sessionDescription: offer,
        tracks: [{
          location: 'remote',
          mid: remoteMid,
          trackName: peerTrackName,
          sessionId: peerSessionId,
          kind: 'audio'  // Specify track type (undocumented field)
        }]
      }

      console.log('Calling SFU API for renegotiation with:', JSON.stringify(requestBody, null, 2))

      // Call Cloudflare Realtime API to add remote track
      const trackResponse = await fetch(
        `https://rtc.live.cloudflare.com/v1/apps/${appId}/sessions/${session.sessionId}/tracks/new`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.env.REALTIME_SFU_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      )

      if (!trackResponse.ok) {
        const errorBody = await trackResponse.text()
        console.error('SFU API error response:', trackResponse.status, errorBody)
        throw new Error(`SFU API error: ${trackResponse.status} - ${errorBody}`)
      }

      const trackData = await trackResponse.json()
      console.log('SFU API response:', JSON.stringify(trackData, null, 2))

      // Check if track has an error
      if (trackData.tracks && trackData.tracks[0] && trackData.tracks[0].errorCode) {
        const track = trackData.tracks[0]
        console.error('Track error:', track.errorCode, track.errorDescription)
        throw new Error(`Track error: ${track.errorCode} - ${track.errorDescription}`)
      }

      // If renegotiation is required, call the renegotiate endpoint
      if (trackData.requiresImmediateRenegotiation) {
        console.log('Immediate renegotiation required')

        const renegotiateResponse = await fetch(
          `https://rtc.live.cloudflare.com/v1/apps/${appId}/sessions/${session.sessionId}/renegotiate`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${this.env.REALTIME_SFU_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sessionDescription: trackData.sessionDescription
            })
          }
        )

        if (!renegotiateResponse.ok) {
          const errorBody = await renegotiateResponse.text()
          console.error('Renegotiate error:', renegotiateResponse.status, errorBody)
          throw new Error(`Renegotiate failed: ${renegotiateResponse.status}`)
        }

        const renegotiateData = await renegotiateResponse.json()
        console.log('Renegotiate response:', JSON.stringify(renegotiateData, null, 2))

        return new Response(JSON.stringify({
          answer: renegotiateData.sessionDescription
        }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({
        answer: trackData.sessionDescription
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Failed to handle SFU renegotiation:', error)
      return new Response(JSON.stringify({
        error: 'Failed to renegotiate',
        details: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  // Helper: Broadcast message to all connected clients except sender
  private broadcast(message: ServerMessage, except?: WebSocket): void {
    const messageStr = JSON.stringify(message)
    const sessions = this.state.getWebSockets()
    console.log(`Broadcasting to ${sessions.length} sessions (except sender):`, message.type)
    sessions.forEach(session => {
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
    const strokesMap = await this.state.storage.list<Stroke>({ prefix: 'stroke:' })
    return Array.from(strokesMap.values())
  }

  // Helper: Save a completed stroke to storage
  private async saveStroke(stroke: Stroke): Promise<void> {
    await this.state.storage.put(`stroke:${stroke.id}`, stroke)
  }
}
