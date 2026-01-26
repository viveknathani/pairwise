/// <reference lib="dom" />

interface Env {
  ROOM: DurableObjectNamespace
  REALTIME_SFU_API_KEY: string
  REALTIME_APP_ID?: string
  ASSETS: {
    fetch: (request: Request) => Promise<Response>
  }
}

interface RoomInfo {
  roomId: string
  url: string
}

interface Point {
  x: number
  y: number
}

interface Stroke {
  id: string
  tool: 'pen' | 'eraser'
  color: string
  points: Point[]
  timestamp: number
}

interface AlarmMetadata {
  type: 'ttl' | 'empty_cleanup'
  createdAt: number
  ttlExpiresAt: number
}

type ClientMessage =
  | { type: 'join' }
  | { type: 'stroke_start'; strokeId: string; tool: string; color: string; x: number; y: number }
  | { type: 'stroke_move'; strokeId: string; x: number; y: number }
  | { type: 'stroke_end'; strokeId: string }
  | { type: 'webrtc_offer'; offer: RTCSessionDescriptionInit; userId: string }
  | { type: 'webrtc_answer'; answer: RTCSessionDescriptionInit; userId: string }
  | { type: 'webrtc_ice_candidate'; candidate: RTCIceCandidateInit; userId: string }

type ServerMessage =
  | { type: 'joined'; userCount: number; yourRole: 'initiator' | 'responder' }
  | { type: 'full_state'; strokes: Stroke[] }
  | { type: 'user_joined'; userCount: number }
  | { type: 'user_left'; userCount: number }
  | { type: 'room_full' }
  | { type: 'stroke_broadcast'; stroke: Stroke }
  | { type: 'stroke_update'; strokeId: string; tool: string; color: string; points: Point[] }
  | { type: 'webrtc_offer'; offer: RTCSessionDescriptionInit; userId: string }
  | { type: 'webrtc_answer'; answer: RTCSessionDescriptionInit; userId: string }
  | { type: 'webrtc_ice_candidate'; candidate: RTCIceCandidateInit; userId: string }

export type { Env, RoomInfo, Point, Stroke, AlarmMetadata, ClientMessage, ServerMessage }
