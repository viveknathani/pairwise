// Main application logic - integrates canvas, WebSocket, and UI

document.addEventListener('DOMContentLoaded', () => {
  // Get room ID from URL
  const roomId = window.location.pathname.split('/').pop()

  // Update room ID display
  document.getElementById('room-id').textContent = `Room: ${roomId}`

  // Initialize canvas
  const canvas = document.getElementById('canvas')
  const drawing = new CanvasDrawing(canvas, handleStrokeEvent)

  // Initialize WebSocket
  const wsClient = new WebSocketClient(roomId)

  // Connect WebSocket handlers
  wsClient.on('joined', (msg) => {
    console.log('Joined room, user count:', msg.userCount)
    updateUserCount(msg.userCount)
  })

  wsClient.on('full_state', (msg) => {
    console.log('Received full state:', msg.strokes.length, 'strokes')
    drawing.renderAllStrokes(msg.strokes)
  })

  wsClient.on('user_joined', (msg) => {
    console.log('User joined, user count:', msg.userCount)
    updateUserCount(msg.userCount)
  })

  wsClient.on('user_left', (msg) => {
    console.log('User left, user count:', msg.userCount)
    updateUserCount(msg.userCount)
  })

  wsClient.on('room_full', () => {
    alert('Room is full (2 users maximum). Redirecting to home...')
    window.location.href = '/'
  })

  wsClient.on('stroke_broadcast', (msg) => {
    console.log('Received completed stroke from peer')
    drawing.completePeerStroke(msg.stroke.id)
    drawing.renderStroke(msg.stroke)
  })

  wsClient.on('stroke_update', (msg) => {
    console.log('Received stroke update from peer')
    drawing.renderStrokeUpdate(msg.strokeId, msg.tool, msg.color, msg.points)
  })

  // Connect WebSocket
  wsClient.connect()

  // Handle stroke events from canvas
  function handleStrokeEvent(eventType, data) {
    if (eventType === 'start') {
      wsClient.sendStrokeStart(data.strokeId, data.tool, data.color, data.x, data.y)
    } else if (eventType === 'move') {
      wsClient.sendStrokeMove(data.strokeId, data.x, data.y)
    } else if (eventType === 'end') {
      wsClient.sendStrokeEnd(data.strokeId)
    }
  }

  // Update user count display
  function updateUserCount(count) {
    document.getElementById('user-count').textContent = `Users: ${count}/2`
  }

  // Tool selection
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.getAttribute('data-tool')

      // Update UI
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      // Update canvas
      drawing.setTool(tool)
    })
  })

  // Color selection
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-color')

      // Update UI
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      // Update canvas
      drawing.setColor(color)
    })
  })

  // Copy room link button
  document.getElementById('copy-link-btn').addEventListener('click', async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)

      const btn = document.getElementById('copy-link-btn')
      const originalText = btn.textContent
      btn.textContent = 'Copied!'

      setTimeout(() => {
        btn.textContent = originalText
      }, 2000)
    } catch (error) {
      console.error('Failed to copy link:', error)
      alert('Failed to copy link. Please copy manually from the address bar.')
    }
  })

  // Audio toggle (integration with audio.js)
  const audioToggleBtn = document.getElementById('audio-toggle')
  const audioStatusSpan = document.getElementById('audio-status')

  audioToggleBtn.addEventListener('click', async () => {
    if (window.audioManager) {
      try {
        await window.audioManager.toggle()
      } catch (error) {
        console.error('Audio error:', error)
        audioStatusSpan.textContent = 'Audio failed'
      }
    } else {
      console.warn('Audio manager not initialized')
      audioStatusSpan.textContent = 'Audio not available'
    }
  })

  // Make wsClient available globally for audio.js
  window.wsClient = wsClient
})
