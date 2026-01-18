// Audio integration using Cloudflare Realtime SFU

class AudioManager {
  constructor(roomId) {
    this.roomId = roomId
    this.isConnected = false
    this.isMuted = false
    this.localStream = null
    this.peerConnection = null
    this.audioStatusEl = document.getElementById('audio-status')
    this.audioToggleBtn = document.getElementById('audio-toggle')
  }

  async toggle() {
    if (this.isConnected) {
      await this.disconnect()
    } else {
      await this.connect()
    }
  }

  async connect() {
    try {
      this.updateStatus('Requesting microphone...')

      // Request microphone permission
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      })

      this.updateStatus('Connecting to audio...')

      // Fetch SFU token from server
      const response = await fetch(`/room/${this.roomId}/sfu/token`)
      if (!response.ok) {
        throw new Error('Failed to get SFU token')
      }

      const { token } = await response.json()
      console.log('Received SFU token:', token)

      // TODO: Initialize Cloudflare Realtime SFU connection with the token
      // This is a placeholder implementation
      // The actual implementation will depend on Cloudflare's Realtime SFU SDK

      /* Example pseudo-code for Cloudflare Realtime SFU:
       *
       * this.peerConnection = new RTCPeerConnection(sfuConfig)
       *
       * // Add local audio track
       * this.localStream.getTracks().forEach(track => {
       *   this.peerConnection.addTrack(track, this.localStream)
       * })
       *
       * // Handle remote tracks
       * this.peerConnection.ontrack = (event) => {
       *   const remoteAudio = new Audio()
       *   remoteAudio.srcObject = event.streams[0]
       *   remoteAudio.play()
       * }
       *
       * // Create offer and set local description
       * const offer = await this.peerConnection.createOffer()
       * await this.peerConnection.setLocalDescription(offer)
       *
       * // Send offer to SFU via signaling
       * const answer = await sendOfferToSFU(token, offer)
       * await this.peerConnection.setRemoteDescription(answer)
       */

      // For now, just simulate connection
      this.isConnected = true
      this.updateStatus('Connected')
      this.audioToggleBtn.textContent = 'Stop Audio'
      this.audioToggleBtn.classList.add('active')

      console.log('Audio connected (placeholder implementation)')
    } catch (error) {
      console.error('Failed to connect audio:', error)
      this.updateStatus('Connection failed')

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop())
        this.localStream = null
      }

      throw error
    }
  }

  async disconnect() {
    try {
      // Stop local media tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop())
        this.localStream = null
      }

      // Close peer connection
      if (this.peerConnection) {
        this.peerConnection.close()
        this.peerConnection = null
      }

      this.isConnected = false
      this.updateStatus('Not connected')
      this.audioToggleBtn.textContent = 'Start Audio'
      this.audioToggleBtn.classList.remove('active')

      console.log('Audio disconnected')
    } catch (error) {
      console.error('Failed to disconnect audio:', error)
      throw error
    }
  }

  toggleMute() {
    if (!this.localStream) return

    this.isMuted = !this.isMuted

    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted
    })

    if (this.isMuted) {
      this.audioToggleBtn.textContent = 'Unmute'
      this.audioToggleBtn.classList.add('muted')
      this.updateStatus('Muted')
    } else {
      this.audioToggleBtn.textContent = 'Mute'
      this.audioToggleBtn.classList.remove('muted')
      this.updateStatus('Connected')
    }
  }

  updateStatus(status) {
    this.audioStatusEl.textContent = status
  }
}

// Initialize audio manager when page loads
document.addEventListener('DOMContentLoaded', () => {
  const roomId = window.location.pathname.split('/').pop()
  window.audioManager = new AudioManager(roomId)
})
