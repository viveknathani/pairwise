import type { Env, RoomInfo, Stroke, AlarmMetadata } from '../types'
import { ROOM_ID_LENGTH } from '../utils'

class RoomService {
  private static instance: RoomService

  private constructor() {}

  static getInstance(): RoomService {
    if (!RoomService.instance) {
      RoomService.instance = new RoomService()
    }
    return RoomService.instance
  }

  generateRoomId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < ROOM_ID_LENGTH; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  createRoom(baseUrl: string): RoomInfo {
    const roomId = this.generateRoomId()
    const url = `${baseUrl}/room/${roomId}`
    return { roomId, url }
  }

  getRoomStub(env: Env, roomId: string): DurableObjectStub {
    const id = env.ROOM.idFromName(roomId)
    return env.ROOM.get(id)
  }

  async loadStrokes(storage: DurableObjectStorage): Promise<Stroke[]> {
    const strokesMap = await storage.list<Stroke>({ prefix: 'stroke:' })
    return Array.from(strokesMap.values())
  }

  async saveStroke(storage: DurableObjectStorage, stroke: Stroke): Promise<void> {
    await storage.put(`stroke:${stroke.id}`, stroke)
  }

  async setupTTLAlarm(storage: DurableObjectStorage): Promise<void> {
    const existingAlarm = await storage.getAlarm()
    if (!existingAlarm) {
      const ttlExpiresAt = Date.now() + 3600000
      await storage.setAlarm(ttlExpiresAt)
      await storage.put<AlarmMetadata>('alarm_metadata', {
        type: 'ttl',
        createdAt: Date.now(),
        ttlExpiresAt,
      })
    }
  }

  async restoreTTLAlarm(storage: DurableObjectStorage): Promise<void> {
    const metadata = await storage.get<AlarmMetadata>('alarm_metadata')
    if (metadata && metadata.ttlExpiresAt > Date.now()) {
      await storage.setAlarm(metadata.ttlExpiresAt)
      await storage.put<AlarmMetadata>('alarm_metadata', {
        ...metadata,
        type: 'ttl',
      })
    }
  }

  async scheduleEmptyRoomCleanup(storage: DurableObjectStorage): Promise<void> {
    const metadata = await storage.get<AlarmMetadata>('alarm_metadata')
    if (metadata) {
      const timeUntilTTL = metadata.ttlExpiresAt - Date.now()

      if (timeUntilTTL < 300000) {
        console.log(
          `Room empty, TTL expires in ${Math.floor(timeUntilTTL / 1000)}s, keeping TTL alarm`
        )
      } else {
        console.log('Room empty, scheduling cleanup in 5 minutes')
        await storage.setAlarm(Date.now() + 300000)
        await storage.put<AlarmMetadata>('alarm_metadata', {
          ...metadata,
          type: 'empty_cleanup',
        })
      }
    }
  }

  async handleAlarm(storage: DurableObjectStorage, userCount: number): Promise<boolean> {
    const metadata = await storage.get<AlarmMetadata>('alarm_metadata')

    if (metadata?.type === 'empty_cleanup' && userCount > 0) {
      console.log('Empty cleanup alarm fired but room has users, restoring TTL alarm')
      if (metadata.ttlExpiresAt > Date.now()) {
        await storage.setAlarm(metadata.ttlExpiresAt)
        await storage.put<AlarmMetadata>('alarm_metadata', {
          ...metadata,
          type: 'ttl',
        })
      }
      return false
    }

    return true
  }

  async cleanupRoom(storage: DurableObjectStorage): Promise<void> {
    await storage.deleteAll()
  }
}

export default RoomService.getInstance()
