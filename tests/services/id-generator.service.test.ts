import { describe, test, expect } from 'bun:test'
import roomService from '../../src/services/RoomService'
import { ROOM_ID_LENGTH } from '../../src/utils'

describe('RoomService.generateRoomId', () => {
  test('should generate ID with correct length', () => {
    const roomId = roomService.generateRoomId()
    expect(roomId).toHaveLength(ROOM_ID_LENGTH)
  })

  test('should generate alphanumeric ID', () => {
    const roomId = roomService.generateRoomId()
    expect(roomId).toMatch(/^[a-z0-9]+$/)
  })

  test('should generate unique IDs', () => {
    const id1 = roomService.generateRoomId()
    const id2 = roomService.generateRoomId()
    expect(id1).not.toBe(id2)
  })
})
