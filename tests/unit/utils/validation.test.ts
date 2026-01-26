import { describe, test, expect } from 'bun:test'
import { isValidRoomId } from '../../../src/utils'

describe('isValidRoomId', () => {
  test('should accept valid 6-character alphanumeric IDs', () => {
    expect(isValidRoomId('abc123')).toBe(true)
    expect(isValidRoomId('xyz789')).toBe(true)
    expect(isValidRoomId('000000')).toBe(true)
    expect(isValidRoomId('aaaaaa')).toBe(true)
  })

  test('should reject IDs with wrong length', () => {
    expect(isValidRoomId('abc12')).toBe(false)
    expect(isValidRoomId('abc1234')).toBe(false)
    expect(isValidRoomId('')).toBe(false)
  })

  test('should reject IDs with special characters', () => {
    expect(isValidRoomId('abc-12')).toBe(false)
    expect(isValidRoomId('abc_12')).toBe(false)
    expect(isValidRoomId('abc@12')).toBe(false)
  })

  test('should accept uppercase letters', () => {
    expect(isValidRoomId('ABC123')).toBe(true)
    expect(isValidRoomId('AbC123')).toBe(true)
  })
})
