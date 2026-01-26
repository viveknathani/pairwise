// WebSocket client for real-time drawing synchronization

class WebSocketClient {
  constructor(roomId) {
    this.roomId = roomId
    this.ws = null
    this.connected = false
    this.handlers = {}
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/room/${this.roomId}/ws`

    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.connected = true

      // Send join message
      this.send({ type: 'join' })

      if (this.handlers.onopen) {
        this.handlers.onopen()
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('Received message:', message)

        // Route message to appropriate handler
        if (this.handlers.onmessage) {
          this.handlers.onmessage(message)
        }

        // Type-specific handlers
        const handler = this.handlers[message.type]
        if (handler) {
          handler(message)
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error)
      }
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      if (this.handlers.onerror) {
        this.handlers.onerror(error)
      }
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected')
      this.connected = false

      if (this.handlers.onclose) {
        this.handlers.onclose()
      }
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('Sending WebSocket message:', message.type)
      this.ws.send(JSON.stringify(message))
      console.log('Message sent successfully')
    } else {
      console.warn(
        'WebSocket not connected, cannot send message:',
        this.ws ? this.ws.readyState : 'no ws'
      )
    }
  }

  on(event, handler) {
    this.handlers[event] = handler
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
    }
  }

  // Helper methods for sending specific message types
  sendStrokeStart(strokeId, tool, color, x, y) {
    this.send({
      type: 'stroke_start',
      strokeId,
      tool,
      color,
      x,
      y,
    })
  }

  sendStrokeMove(strokeId, x, y) {
    this.send({
      type: 'stroke_move',
      strokeId,
      x,
      y,
    })
  }

  sendStrokeEnd(strokeId) {
    this.send({
      type: 'stroke_end',
      strokeId,
    })
  }
}

// Make available globally
window.WebSocketClient = WebSocketClient
