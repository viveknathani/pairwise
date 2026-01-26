export const ROOM_ID_LENGTH = 6
export const ROOM_ID_REGEX = /^[a-z0-9]{6}$/i
export const ROOM_TTL_MS = 3600000 // 1 hour
export const EMPTY_ROOM_CLEANUP_MS = 300000 // 5 minutes
export const MAX_USERS_PER_ROOM = 2

export function isValidRoomId(roomId: string): boolean {
  return ROOM_ID_REGEX.test(roomId)
}

export default {
  ROOM_ID_LENGTH,
  ROOM_ID_REGEX,
  ROOM_TTL_MS,
  EMPTY_ROOM_CLEANUP_MS,
  MAX_USERS_PER_ROOM,
  isValidRoomId,
}
