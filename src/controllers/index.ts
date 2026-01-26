import type { Context } from 'hono'
import type { Env } from '../types'
import roomService from '../services/RoomService'
import { isValidRoomId } from '../utils'

async function handleCreateRoom(c: Context<{ Bindings: Env }>) {
  const baseUrl = new URL(c.req.url).origin
  const roomInfo = roomService.createRoom(baseUrl)
  return c.json(roomInfo)
}

async function handleRoomWebSocket(c: Context<{ Bindings: Env }>) {
  const roomId = c.req.param('id')

  if (!isValidRoomId(roomId)) {
    return c.text('Invalid room ID', 400)
  }

  const stub = roomService.getRoomStub(c.env, roomId)
  return stub.fetch(c.req.raw)
}

async function handleRoomPage(c: Context<{ Bindings: Env }>) {
  const roomId = c.req.param('id')

  if (!isValidRoomId(roomId)) {
    return c.text('Invalid room ID', 400)
  }

  const roomRequest = new Request(`${new URL(c.req.url).origin}/room.html`, {
    method: 'GET',
  })
  return c.env.ASSETS.fetch(roomRequest)
}

async function handleIndexPage(c: Context<{ Bindings: Env }>) {
  const indexRequest = new Request(`${new URL(c.req.url).origin}/index.html`)
  return c.env.ASSETS.fetch(indexRequest)
}

async function handleStaticAsset(c: Context<{ Bindings: Env }>) {
  return c.env.ASSETS.fetch(c.req.raw)
}

export default {
  handleCreateRoom,
  handleRoomWebSocket,
  handleRoomPage,
  handleIndexPage,
  handleStaticAsset,
}
