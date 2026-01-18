// Audio integration using Cloudflare Realtime SFU

class AudioManager {
  constructor(roomId) {
    this.roomId = roomId
    this.isConnected = false
    this.isMuted = false
    this.localStream = null
    this.peerConnection = null
    this.sessionId = null
    this.userId = `user-${Math.random().toString(36).substr(2, 9)}`
    this.audioStatusEl = document.getElementById('audio-status')
    this.audioToggleBtn = document.getElementById('audio-toggle')
    this.isFullyConnected = false
    this.pendingPeerTracks = []
    this.remoteAudio = null
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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })

      this.updateStatus('Creating session...')

      // Create SFU session
      const sessionResponse = await fetch(`/room/${this.roomId}/sfu/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.userId })
      })

      if (!sessionResponse.ok) {
        throw new Error('Failed to create SFU session')
      }

      const { sessionId, appId, peerTracks } = await sessionResponse.json()
      this.sessionId = sessionId
      console.log('SFU session created:', sessionId)

      this.updateStatus('Connecting to SFU...')

      // Create RTCPeerConnection with Cloudflare STUN server
      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }]
      })

      // Add local audio track
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream)
        console.log('Added local track:', track.kind)
      })

      // Handle incoming remote tracks from SFU
      this.peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind, event.streams.length, 'streams')

        if (!this.remoteAudio) {
          this.remoteAudio = new Audio()
          this.remoteAudio.autoplay = true
          this.remoteAudio.volume = 1.0
          document.body.appendChild(this.remoteAudio) // Add to DOM to prevent garbage collection
        }

        this.remoteAudio.srcObject = event.streams[0]

        const tracks = event.streams[0].getTracks()
        console.log('Remote stream tracks:', tracks.map(t => `${t.kind}: enabled=${t.enabled}, readyState=${t.readyState}, muted=${t.muted}`))

        // Check if track is actually producing audio
        tracks.forEach(track => {
          if (track.kind === 'audio') {
            track.onmute = () => console.warn('Remote track MUTED!')
            track.onunmute = () => console.log('Remote track UNMUTED')
            track.onended = () => console.warn('Remote track ENDED!')

            console.log('Track settings:', track.getSettings())
            console.log('Track constraints:', track.getConstraints())
          }
        })

        this.remoteAudio.play()
          .then(() => {
            console.log('Remote audio playing successfully!')
            console.log('Audio element state: paused=' + this.remoteAudio.paused + ', volume=' + this.remoteAudio.volume + ', muted=' + this.remoteAudio.muted)
            this.updateStatus('Connected - Receiving audio')
          })
          .catch(e => {
            console.error('Failed to play remote audio:', e)
            this.updateStatus('Connected - Audio blocked by browser')
          })
      }

      // Handle ICE connection state
      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', this.peerConnection.iceConnectionState)
        if (this.peerConnection.iceConnectionState === 'connected') {
          this.updateStatus('Connected - Sending audio')
          this.isFullyConnected = true

          // Now that we're fully connected, wait a moment for peer to start sending,
          // then subscribe to any waiting peer tracks
          if (this.pendingPeerTracks && this.pendingPeerTracks.length > 0) {
            console.log('ICE connected! Waiting 2 seconds before subscribing to peer tracks...')
            setTimeout(() => {
              console.log('Processing pending peer tracks:', this.pendingPeerTracks)
              for (const peerTrack of this.pendingPeerTracks) {
                this.subscribeToPeerTrack(peerTrack.trackId, peerTrack.userId, peerTrack.sessionId)
              }
              this.pendingPeerTracks = []
            }, 2000)
          }
        }
      }

      // Create offer
      const offer = await this.peerConnection.createOffer()
      await this.peerConnection.setLocalDescription(offer)
      console.log('Created offer')

      // Send offer to backend, get answer
      const offerResponse = await fetch(`/room/${this.roomId}/sfu/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          offer: this.peerConnection.localDescription
        })
      })

      if (!offerResponse.ok) {
        throw new Error('Failed to send offer')
      }

      const { answer, trackId } = await offerResponse.json()
      console.log('Received answer, trackId:', trackId)

      // Set remote description
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))

      this.isConnected = true
      this.audioToggleBtn.textContent = 'Stop Audio'
      this.audioToggleBtn.classList.add('active')

      // Queue existing peer tracks (they'll be subscribed once ICE is connected)
      if (peerTracks.length > 0) {
        console.log('Queueing existing peer tracks:', peerTracks)
        this.pendingPeerTracks.push(...peerTracks.map(pt => ({
          trackId: pt.trackId,
          userId: pt.userId,
          sessionId: pt.sessionId
        })))
      }

      console.log('Audio connected successfully')
    } catch (error) {
      console.error('Failed to connect audio:', error)
      this.updateStatus('Connection failed: ' + error.message)

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop())
        this.localStream = null
      }

      throw error
    }
  }

  async subscribeToPeerTrack(trackId, peerUserId, peerSessionId) {
    console.log('Peer track notification:', trackId, 'from user:', peerUserId, 'session:', peerSessionId)
    console.log('Currently relying on automatic track forwarding via ontrack - not manually subscribing yet')
  }

  async disconnect() {
    try {
      // Stop local media tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop())
        this.localStream = null
      }

      // Remove and clean up remote audio
      if (this.remoteAudio) {
        this.remoteAudio.pause()
        this.remoteAudio.srcObject = null
        if (this.remoteAudio.parentNode) {
          this.remoteAudio.parentNode.removeChild(this.remoteAudio)
        }
        this.remoteAudio = null
      }

      // Close peer connection
      if (this.peerConnection) {
        this.peerConnection.close()
        this.peerConnection = null
      }

      this.isConnected = false
      this.isFullyConnected = false
      this.pendingPeerTracks = []
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
