// Simple peer-to-peer WebRTC audio using Durable Object for signaling

class AudioManager {
  constructor(roomId) {
    this.roomId = roomId
    this.isConnected = false
    this.isMuted = false
    this.localStream = null
    this.peerConnection = null
    this.userId = `user-${Math.random().toString(36).substr(2, 9)}`
    this.audioStatusEl = document.getElementById('audio-status')
    this.audioToggleBtn = document.getElementById('audio-toggle')
    this.remoteAudio = null
    this.isInitiator = false
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
          autoGainControl: true,
        },
        video: false,
      })

      console.log('Got local audio stream')

      this.updateStatus('Setting up connection...')

      // Create RTCPeerConnection with STUN servers
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          // { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      })

      // Add local audio track
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream)
        console.log('Added local track:', track.kind)
      })

      // Handle incoming remote tracks
      this.peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind)

        if (!this.remoteAudio) {
          this.remoteAudio = new Audio()
          this.remoteAudio.autoplay = true
          this.remoteAudio.volume = 1.0
          document.body.appendChild(this.remoteAudio)
        }

        this.remoteAudio.srcObject = event.streams[0]
        this.remoteAudio
          .play()
          .then(() => {
            console.log('Playing remote audio!')
            this.updateStatus('Connected - Audio active')
          })
          .catch((e) => console.error('Failed to play remote audio:', e))
      }

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate')
          window.wsClient.send({
            type: 'webrtc_ice_candidate',
            candidate: event.candidate.toJSON(),
            userId: this.userId,
          })
        }
      }

      // Handle connection state
      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', this.peerConnection.iceConnectionState)
        if (this.peerConnection.iceConnectionState === 'connected') {
          this.updateStatus('Connected')
        } else if (this.peerConnection.iceConnectionState === 'failed') {
          this.updateStatus('Connection failed')
        }
      }

      this.isConnected = true
      this.audioToggleBtn.textContent = 'Stop Audio'
      this.audioToggleBtn.classList.add('active')

      console.log('Audio manager ready, userId:', this.userId)

      // Check if there's already a peer in the room
      const userCount = window.getCurrentUserCount ? window.getCurrentUserCount() : 1
      console.log('Current user count:', userCount)

      if (userCount === 2) {
        console.log('Peer already in room - creating WebRTC offer')
        setTimeout(() => {
          this.createOffer()
        }, 500)
      } else {
        console.log('Waiting for peer to join...')
        this.updateStatus('Waiting for peer...')
      }
    } catch (error) {
      console.error('Failed to connect audio:', error)
      this.updateStatus('Connection failed: ' + error.message)

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop())
        this.localStream = null
      }

      throw error
    }
  }

  async createOffer() {
    if (!this.peerConnection) {
      console.warn('No peer connection to create offer')
      return
    }

    if (this.isInitiator) {
      console.log('Already initiator, skipping offer creation')
      return
    }

    this.isInitiator = true
    console.log('Creating offer as initiator')

    try {
      const offer = await this.peerConnection.createOffer()
      await this.peerConnection.setLocalDescription(offer)

      console.log('Created offer, sending to peer via WebSocket')
      console.log('Offer SDP:', offer.sdp.substring(0, 100) + '...')

      window.wsClient.send({
        type: 'webrtc_offer',
        offer: this.peerConnection.localDescription.toJSON(),
        userId: this.userId,
      })

      console.log('Offer sent successfully')
      this.updateStatus('Waiting for answer...')
    } catch (error) {
      console.error('Failed to create/send offer:', error)
      this.updateStatus('Failed to create offer')
    }
  }

  async handleOffer(offer, peerId) {
    if (!this.peerConnection) {
      console.warn('No peer connection to handle offer')
      return
    }

    console.log('Received offer from peer:', peerId)

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer))

    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)

    console.log('Sending answer to peer')
    window.wsClient.send({
      type: 'webrtc_answer',
      answer: this.peerConnection.localDescription.toJSON(),
      userId: this.userId,
    })

    this.updateStatus('Connecting...')
  }

  async handleAnswer(answer, peerId) {
    if (!this.peerConnection) {
      console.warn('No peer connection to handle answer')
      return
    }

    console.log('Received answer from peer:', peerId)

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))

    this.updateStatus('Connecting...')
  }

  async handleIceCandidate(candidate, peerId) {
    if (!this.peerConnection) {
      console.warn('No peer connection to add ICE candidate')
      return
    }

    console.log('Received ICE candidate from peer:', peerId)

    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
  }

  async disconnect() {
    try {
      // Stop local media tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop())
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
      this.isInitiator = false
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

    this.localStream.getAudioTracks().forEach((track) => {
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
