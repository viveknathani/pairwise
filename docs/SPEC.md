# pairwise

You are a senior and pragmatic systems designer.

Your task is to help build a small web product called pairwise, end-to-end, from page load to teardown.

A repository called "pairwise" is initialized in here with Cloudflare Workers, Wrangler, and Hono.

## summary

Pairwise is a lightweight, ephemeral, two-person web experience.

Two users:

join a private room

talk via audio

draw together on a shared fixed-size canvas

Rooms automatically expire after ~1 hour.

This is not a social network, not a competitive game, and not persistent software.
The core values are simplicity, presence, and reliability.

## e2e behaviour

A user visits pairwise.vivekn.dev

- HTML, CSS, and JS are served from a Cloudflare Worker
- No authentication
- A user clicks Create Room
- A short room ID is generated
- The room maps to one Durable Object instance
- The room has a TTL of ~1 hour
- A second user joins via the link
- Maximum 2 participants enforced strictly
- Extra joins are rejected
- Inside the room
- Users draw on a fixed-size canvas
- Drawing events are synced via WebSocket → Durable Object
- Final strokes are persisted in Durable Object storage to allow refresh/reconnect
- Live drawing is broadcast in real time
- No CRDTs or complex conflict resolution

Audio
- Audio uses Cloudflare Realtime (SFU)
- Media never passes through the Worker or Durable Object
- The Durable Object may coordinate room metadata but does not relay audio

Teardown

- When both users leave or TTL expires, the Durable Object cleans up all state
- No data is retained

## technical requirements

Worker (Hono)
- Serve static assets (HTML, CSS, JS)
- Expose minimal APIs: POST /room → create room GET /room/:id → validate and route
- Route room traffic to the correct Durable Object
- Remain stateless

Durable Object (Room)
- One Durable Object per room
- Track:
-- connected users (max 2)
-- WebSocket connections
-- in-memory stroke buffer
-- persisted stroke list
- On join:
-- send full canvas state
- On stroke end:
-- persist completed stroke
-- broadcast to peer
- Enforce TTL and cleanup

Drawing model
- Fixed canvas size
- Freehand pen + eraser
- Small color palette
- Persist completed strokes only
- No layers, no undo, no shapes

Audio
- WebRTC audio via Cloudflare Realtime SFU
- Audio handled independently from drawing
- Client code should abstract audio behind a simple API

Do not design or suggest:
- User accounts or authentication
- Recording or playback
- Chat logs
- Multi-room presence
- More than two participants
- CRDTs, OT, or complex sync systems

## Design aesthetics & visual tone

- The interface should feel **game-like, cozy, and playful**, not like a productivity or whiteboard tool.
- Visual inspiration: *Stardew Valley*–style warmth and friendliness.
- Avoid typical SaaS aesthetics:
  - no sharp edges
  - no heavy greys
  - no “enterprise” or “pro” UI feel
- Prefer:
  - soft, pastel color palette
  - rounded corners and friendly shapes
  - subtle texture or grain (optional)
  - simple, pixel or hand-drawn iconography
- Animations should be:
  - slow and intentional
  - small and meaningful (hover, join, connect states)
  - never flashy or attention-seeking
- The canvas should feel like:
  - a piece of paper on a desk
  - a shared sketchbook
  - something you *play in*, not *work in*
- Overall mood:
  - calm
  - welcoming
  - slightly nostalgic
  - closer to an indie game than a web app
