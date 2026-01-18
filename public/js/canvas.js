// Canvas drawing logic

class CanvasDrawing {
  constructor(canvasElement, onStrokeEvent) {
    this.canvas = canvasElement
    this.ctx = canvasElement.getContext('2d')
    this.onStrokeEvent = onStrokeEvent

    this.isDrawing = false
    this.currentStrokeId = null
    this.currentTool = 'pen'
    this.currentColor = '#5d4e37'
    this.peerStrokes = new Map() // Track in-progress peer strokes

    this.setupCanvas()
    this.setupEventListeners()
  }

  setupCanvas() {
    // Set up canvas context
    this.ctx.lineCap = 'round'
    this.ctx.lineJoin = 'round'
    this.ctx.lineWidth = 3
  }

  setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this))
    this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this))
    this.canvas.addEventListener('pointerup', this.handlePointerUp.bind(this))
    this.canvas.addEventListener('pointerleave', this.handlePointerUp.bind(this))
  }

  handlePointerDown(e) {
    e.preventDefault()
    this.isDrawing = true

    const pos = this.getPointerPosition(e)
    this.currentStrokeId = this.generateStrokeId()

    // Notify server of stroke start
    if (this.onStrokeEvent) {
      this.onStrokeEvent('start', {
        strokeId: this.currentStrokeId,
        tool: this.currentTool,
        color: this.currentColor,
        x: pos.x,
        y: pos.y
      })
    }

    // Start drawing locally
    this.beginPath(pos.x, pos.y)
  }

  handlePointerMove(e) {
    if (!this.isDrawing) return
    e.preventDefault()

    const pos = this.getPointerPosition(e)

    // Draw locally
    this.lineTo(pos.x, pos.y)

    // Notify server of stroke move
    if (this.onStrokeEvent) {
      this.onStrokeEvent('move', {
        strokeId: this.currentStrokeId,
        x: pos.x,
        y: pos.y
      })
    }
  }

  handlePointerUp(e) {
    if (!this.isDrawing) return
    e.preventDefault()

    this.isDrawing = false

    // Notify server of stroke end
    if (this.onStrokeEvent) {
      this.onStrokeEvent('end', {
        strokeId: this.currentStrokeId
      })
    }

    this.currentStrokeId = null
  }

  getPointerPosition(e) {
    const rect = this.canvas.getBoundingClientRect()
    const scaleX = this.canvas.width / rect.width
    const scaleY = this.canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  generateStrokeId() {
    return `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  beginPath(x, y) {
    this.ctx.globalCompositeOperation = this.currentTool === 'eraser' ? 'destination-out' : 'source-over'
    this.ctx.strokeStyle = this.currentColor
    this.ctx.lineWidth = this.currentTool === 'pen' ? 3 : 20

    this.ctx.beginPath()
    this.ctx.moveTo(x, y)
  }

  lineTo(x, y) {
    this.ctx.lineTo(x, y)
    this.ctx.stroke()
  }

  setTool(tool) {
    this.currentTool = tool
  }

  setColor(color) {
    this.currentColor = color
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  // Render a complete stroke (from peer or storage)
  renderStroke(stroke) {
    if (!stroke.points || stroke.points.length === 0) return

    this.ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
    this.ctx.strokeStyle = stroke.color
    this.ctx.lineWidth = stroke.tool === 'pen' ? 3 : 20

    this.ctx.beginPath()
    this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y)

    for (let i = 1; i < stroke.points.length; i++) {
      this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
    }

    this.ctx.stroke()
  }

  // Render in-progress stroke update (from peer)
  renderStrokeUpdate(strokeId, tool, color, points) {
    if (!points || points.length === 0) return

    // Store peer stroke
    this.peerStrokes.set(strokeId, { tool, color, points })

    // Render just this stroke (it persists on canvas)
    this.renderStroke({ tool, color, points })
  }

  // Called when peer completes a stroke
  completePeerStroke(strokeId) {
    // Remove from active tracking (it's now persisted)
    this.peerStrokes.delete(strokeId)
  }

  // Render all strokes from storage
  renderAllStrokes(strokes) {
    this.clearCanvas()
    strokes.forEach(stroke => this.renderStroke(stroke))
  }
}

// Make available globally
window.CanvasDrawing = CanvasDrawing
