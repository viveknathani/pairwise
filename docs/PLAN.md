# Pairwise Implementation Plan

## Implementation Status (Updated: Jan 18, 2026)

### ✅ Completed
- **Core Infrastructure**: Cloudflare Workers + Durable Objects + Hono configured
- **Room Management**: Durable Object with WebSocket support, 2-user limit, stroke persistence
- **Real-time Drawing**: Bidirectional sync with pen/eraser, color palette, cursor scaling fix
- **User Interface**: Landing page + room interface with cozy Stardew Valley-inspired styling
- **User Tracking**: Connection counting, join/leave notifications
- **Stroke Persistence**: Completed strokes saved to Durable Object storage, reload on reconnect
- **Static Assets**: Configured with proper routing (assets binding)
- **TypeScript**: Cloudflare Workers types configured

### ⚠️ Partial/Placeholder
- **Audio Integration**: Placeholder code exists but Cloudflare Realtime SFU SDK not integrated
- **TTL Cleanup**: Implemented (1-hour expiry) but not tested
- **Room Full Enforcement**: Logic exists but not tested with 3rd user

### ❌ Not Implemented
- **Production Deployment**: Not yet deployed to Cloudflare
- **Cloudflare Realtime SFU**: Actual SDK integration needed

---

## Overview
Build an ephemeral two-person collaborative drawing and audio chat application using Cloudflare Workers, Durable Objects, and Cloudflare Realtime SFU (Realtime SFU).

## Architecture Summary

```
User Browser → Cloudflare Worker (Hono) → Durable Object (Room)
                                        ↓
                                   WebSocket for drawing sync

User Browser → Cloudflare Realtime SFU (SFU) ← User Browser
              (direct WebRTC audio, bypasses Worker/DO)
```

## Project Structure

```
pairwise/
├── src/
│   ├── index.ts          # Main Worker (routes + static serving)
│   └── room.ts           # Room Durable Object
├── public/               # Static assets
│   ├── index.html        # Landing page
│   ├── room.html         # Room interface
│   ├── css/
│   │   └── styles.css    # Cozy styling
│   └── js/
│       ├── app.js        # Main app logic
│       ├── canvas.js     # Drawing logic
│       ├── websocket.js  # WebSocket client
│       └── audio.js      # Cloudflare Realtime SFU integration
├── wrangler.jsonc        # Cloudflare config
├── package.json
└── tsconfig.json
```

## Implementation Steps

### Phase 1: Configuration & Foundation

#### 1.1 Update wrangler.jsonc
**File**: `wrangler.jsonc`

Add Durable Object binding and configure static assets:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "pairwise",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-18",
  "durable_objects": {
    "bindings": [
      {
        "name": "ROOM",
        "class_name": "Room",
        "script_name": "pairwise"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["Room"]
    }
  ],
  // REALTIME_SFU_API_KEY should be added as a secret: wrangler secret put REALTIME_SFU_API_KEY
}
```

**Static assets**: Cloudflare Workers can serve files from a directory during deployment. We'll use Hono's static middleware to serve from the `public/` directory.

**Note**: For static file serving in Workers, files need to be bundled with the Worker or served via Assets. We'll handle this in the Worker implementation.

### Phase 2: Durable Object Implementation

#### 2.1 Create Room Durable Object
**File**: `src/room.ts` (new file)

**Responsibilities**:
- Track up to 2 WebSocket connections (enforce strict limit)
- Persist completed strokes to Durable Object storage
- Broadcast drawing events to connected peers
- Manage room TTL (~1 hour)
- Clean up on expiry or when both users leave

**Key APIs**:
- `DurableObjectState.storage` for persisting strokes
- `env.state.acceptWebSocket()` for WebSocket handling
- `alarm()` for TTL enforcement

**Data structures**:
```typescript
interface Stroke {
  id: string
  tool: 'pen' | 'eraser'
  color: string
  points: Array<{ x: number; y: number }>
  timestamp: number
}

interface RoomState {
  strokes: Stroke[]
  connectedUsers: number  // max 2
  createdAt: number
}
```

**WebSocket message protocol**:
```typescript
// Client → Server
type ClientMessage =
  | { type: 'join' }
  | { type: 'stroke_start'; strokeId: string; tool: string; color: string; x: number; y: number }
  | { type: 'stroke_move'; strokeId: string; x: number; y: number }
  | { type: 'stroke_end'; strokeId: string }

// Server → Client
type ServerMessage =
  | { type: 'joined'; userCount: number }
  | { type: 'full_state'; strokes: Stroke[] }
  | { type: 'user_joined'; userCount: number }
  | { type: 'user_left'; userCount: number }
  | { type: 'room_full' }
  | { type: 'stroke_broadcast'; stroke: Stroke }  // broadcast to peer
  | { type: 'stroke_update'; strokeId: string; points: Point[] }  // in-progress stroke
```

**Critical patterns**:
1. On WebSocket connection:
   - Check if room is full (2 users max)
   - If full, send `room_full` and close connection
   - Otherwise, accept WebSocket and send `full_state` with all persisted strokes
   - Broadcast `user_joined` to peer

2. On stroke_end:
   - Persist completed stroke to storage
   - Broadcast to peer

3. On WebSocket close:
   - Decrement user count
   - Broadcast `user_left` to remaining peer
   - If both users gone, schedule cleanup alarm

4. Alarm handler:
   - Delete all storage
   - Clean up state

### Phase 3: Worker Routes

#### 3.1 Update src/index.ts
**File**: `src/index.ts`

**Routes to implement**:

1. **GET /** - Serve landing page HTML
   - Return `public/index.html`
   - Show "Create Room" button
   - Cozy, game-like UI

2. **POST /room** - Create new room
   - Generate short room ID (6 random alphanumeric characters: `crypto.randomUUID().slice(0, 6)` or custom generator)
   - Return `{ roomId: string, url: string }`
   - Room URL: `https://pairwise.vivekn.dev/room/${roomId}`

3. **GET /room/:id** - Serve room interface HTML
   - Return `public/room.html` with room ID injected
   - Validate room ID format (6 alphanumeric chars)

4. **GET /room/:id/ws** - WebSocket upgrade
   - Get Durable Object stub for room ID: `env.ROOM.idFromName(roomId)`
   - Forward WebSocket to Durable Object

5. **GET /room/:id/sfu/token** - Generate Realtime SFU session token
   - Use `env.REALTIME_SFU_API_KEY` to authenticate with Cloudflare's SFU API
   - Return session token scoped to room ID for WebRTC audio connection

6. **GET /\*** - Serve static assets from public/ directory
   - Use Hono's static file serving middleware
   - Serve CSS, JS, images, etc. from `public/` directory

**Cloudflare Durable Objects API pattern**:
```typescript
const id = env.ROOM.idFromName(roomId)
const stub = env.ROOM.get(id)
return stub.fetch(request)
```

### Phase 4: Frontend - Landing Page

#### 4.1 Create landing page HTML
**File**: `public/index.html`

**Elements**:
- Title: "pairwise"
- Subtitle: "draw together, talk together"
- "Create Room" button (POST to /room, then redirect)
- Cozy aesthetic with pastel colors
- Link to shared stylesheet

### Phase 5: Frontend - Room Interface

#### 4.2 Create room page HTML
**File**: `public/room.html`

**Structure**:
```html
<div id="app">
  <header>
    <span id="room-id">Room: ABC123</span>
    <span id="user-count">Users: 1/2</span>
  </header>

  <main>
    <canvas id="canvas" width="800" height="600"></canvas>
  </main>

  <aside id="toolbar">
    <button data-tool="pen" class="active">Pen</button>
    <button data-tool="eraser">Eraser</button>
    <div id="color-palette">
      <!-- 6-8 pastel colors -->
      <button data-color="#ff9999"></button>
      <button data-color="#99ccff"></button>
      <button data-color="#99ff99"></button>
      <button data-color="#ffcc99"></button>
      <button data-color="#cc99ff"></button>
      <button data-color="#ffff99"></button>
    </div>
  </aside>

  <footer>
    <button id="audio-toggle">Start Audio</button>
    <span id="audio-status">Not connected</span>
  </footer>
</div>
```

#### 4.3 Canvas drawing logic
**File**: `public/js/canvas.js`

**Features**:
- Mouse/touch event handling (pointerdown, pointermove, pointerup)
- Draw pen strokes (lines) or erase (composite operation 'destination-out')
- Send stroke events via WebSocket
- Render incoming strokes from peer

**Pattern**:
1. On pointerdown: Start new stroke, send `stroke_start`
2. On pointermove: Add point to current stroke, send `stroke_move`
3. On pointerup: Complete stroke, send `stroke_end`
4. On receiving `stroke_broadcast`: Render completed stroke to canvas
5. On receiving `full_state`: Re-render all persisted strokes

**Canvas API**:
```javascript
const ctx = canvas.getContext('2d')
ctx.strokeStyle = color
ctx.lineWidth = tool === 'pen' ? 3 : 20
ctx.lineCap = 'round'
ctx.lineJoin = 'round'

// For eraser
ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
```

#### 4.4 WebSocket client
**File**: `public/js/websocket.js`

**Pattern**:
```javascript
const ws = new WebSocket(`wss://${location.host}/room/${roomId}/ws`)

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'join' }))
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  switch(msg.type) {
    case 'full_state':
      renderAllStrokes(msg.strokes)
      break
    case 'stroke_broadcast':
      renderStroke(msg.stroke)
      break
    case 'user_joined':
    case 'user_left':
      updateUserCount(msg.userCount)
      break
    case 'room_full':
      alert('Room is full (2 users max)')
      window.location.href = '/'
      break
  }
}
```

### Phase 6: Audio Integration (Cloudflare Realtime SFU)

#### 6.1 Cloudflare Realtime SFU Setup
**Documentation reference**: Cloudflare Realtime SFU is a WebRTC SFU (Selective Forwarding Unit)

**Required**:
- `REALTIME_SFU_API_KEY` from Cloudflare dashboard (already configured)
- Set as Wrangler secret: `wrangler secret put REALTIME_SFU_API_KEY`

**Worker endpoint**:
- **GET /room/:id/sfu/token** - Generate SFU session token
  - Use `REALTIME_SFU_API_KEY` to authenticate with Cloudflare's SFU API
  - Return session token for client to join WebRTC session
  - Token should be scoped to the specific room ID

**Client-side**:
**File**: `public/js/audio.js`

```javascript
// Cloudflare Realtime SFU SDK usage (user has REALTIME_SFU_API_KEY configured)
// Fetch session token from worker endpoint
const sessionToken = await fetch(`/room/${roomId}/sfu/token`).then(r => r.json())

// Initialize Realtime SFU connection
const rtc = new RTCPeerConnection()
// Connect to Cloudflare Realtime SFU (implementation depends on their SDK)
// This may involve WebRTC signaling through the SFU
```

**Environment variable**: `REALTIME_SFU_API_KEY` should be set as a Wrangler secret.

#### 6.2 Audio UI controls
- "Start Audio" button to request mic permission and join audio room
- "Mute/Unmute" toggle
- Visual indicator of peer audio connection status

### Phase 7: Styling (Cozy, Game-like Aesthetic)

#### 7.1 CSS approach
**File**: `public/css/styles.css`

**Design principles**:
- Soft pastel background colors (#fef5e7, #e8f5f5, etc.)
- Rounded corners everywhere (border-radius: 8px-16px)
- Gentle box-shadows for depth
- Friendly sans-serif font (system-ui or web font)
- Canvas with subtle border/shadow to look like paper

**Color palette** (examples):
```css
:root {
  --bg-primary: #fef5e7;
  --bg-secondary: #fff8e1;
  --accent-1: #ff9999;
  --accent-2: #99ccff;
  --accent-3: #99ff99;
  --accent-4: #ffcc99;
  --text-primary: #5d4e37;
  --text-secondary: #8b7355;
}
```

**Animations**:
- Slow hover transitions (300-400ms ease)
- Small scale effects on button hover (transform: scale(1.05))
- Subtle fade-ins for UI elements

**Canvas styling**:
```css
#canvas {
  background: #fffff8;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  /* Optional: paper texture background */
}
```

### Phase 8: Room Lifecycle & TTL

#### 8.1 TTL implementation in Room DO
- On room creation, set alarm for 1 hour: `state.storage.setAlarm(Date.now() + 3600000)`
- In alarm handler: Delete all strokes, clean up state
- Reset alarm if users are still active (debounce TTL on activity)

#### 8.2 Cleanup on empty room
- When both users leave, immediately schedule alarm for cleanup (e.g., 5 minutes grace period)
- If a user reconnects within grace period, cancel cleanup alarm

### Phase 9: Testing & Verification

#### 9.1 Local development
```bash
bun run dev  # or npm run dev
```
- Test with `wrangler dev` which simulates Durable Objects locally
- Open two browser tabs to test two-user interaction

#### 9.2 End-to-end test checklist
- [ ] Create room from landing page
- [ ] Join room in second browser tab/window
- [ ] Verify third user is rejected (room full)
- [ ] Draw with pen, verify peer sees strokes in real-time
- [ ] Draw with eraser, verify erase works
- [ ] Change colors, verify peer sees correct colors
- [ ] Refresh one client, verify persisted strokes reload
- [ ] Start audio, verify both users can hear each other
- [ ] Close one tab, verify remaining user sees "user left"
- [ ] Leave room empty, verify cleanup after TTL

#### 9.3 Edge cases
- [ ] Handle WebSocket disconnection/reconnection gracefully
- [ ] Handle rapid drawing events (throttle if needed)
- [ ] Validate stroke data (prevent malformed messages)
- [ ] Handle room ID that doesn't exist (show error)

## Critical Files to Create/Modify

### Configuration
| File | Status | Purpose |
|------|--------|---------|
| `wrangler.jsonc` | Update | Add Durable Object bindings + Calls credentials |

### Backend (Worker + Durable Object)
| File | Status | Purpose |
|------|--------|---------|
| `src/room.ts` | Create | Room Durable Object implementation |
| `src/index.ts` | Update | Worker routes + static file serving |

### Frontend (Static Files)
| File | Status | Purpose |
|------|--------|---------|
| `public/index.html` | Create | Landing page UI |
| `public/room.html` | Create | Room interface with canvas |
| `public/css/styles.css` | Create | Cozy, game-like styling |
| `public/js/canvas.js` | Create | Canvas drawing logic |
| `public/js/websocket.js` | Create | WebSocket client |
| `public/js/audio.js` | Create | Cloudflare Realtime SFU integration |
| `public/js/app.js` | Create | Main application logic (room state, UI updates) |

## Dependencies to Add
- None required beyond existing `hono` and `wrangler`
- Cloudflare Realtime SFU SDK (if separate package exists, TBD)

## Implementation Decisions

Based on user preferences:

1. **Asset serving**: Separate static files (public/ directory)
2. **Canvas size**: 800x600 (4:3 ratio)
3. **Room IDs**: Random alphanumeric (6-8 characters)
4. **Cloudflare Realtime SFU**: Already configured (credentials available)
5. **Stroke smoothing**: Keep simple for MVP (can enhance later)
6. **Error handling**: Inline messages + simple alerts for critical errors

## Implementation Order Recommendation

1. Phase 1: Configuration (wrangler.jsonc)
2. Phase 2: Durable Object (room.ts)
3. Phase 3: Worker routes (index.ts) with static file serving
4. Phase 4: Landing page (public/index.html + basic CSS)
5. Phase 5: Room interface (public/room.html + canvas.js + websocket.js + app.js)
6. Phase 7: Styling (public/css/styles.css - make it cozy!)
7. Phase 6: Audio integration (public/js/audio.js + Cloudflare Realtime SFU)
8. Phase 8: TTL cleanup in Durable Object
9. Phase 9: End-to-end testing

**Rationale**: Build core functionality (drawing sync) first, then add audio, then polish with styling and lifecycle management.

## Verification & Testing Plan

### Local Development
```bash
# Start Wrangler dev server (simulates Durable Objects locally)
bun run dev

# Access at http://localhost:8787
```

### Manual End-to-End Test Flow

**Setup**:
1. Start local dev server
2. Open browser to http://localhost:8787

**Test Sequence**:
1. **Landing Page**:
   - [x] Verify landing page loads with "Create Room" button
   - [x] Verify cozy styling (pastels, rounded corners)

2. **Room Creation**:
   - [x] Click "Create Room"
   - [x] Verify redirect to /room/{roomId} with 6-character alphanumeric ID
   - [x] Verify room page loads with canvas (800x600)

3. **Two-User Drawing Sync**:
   - [x] Open same room URL in second browser tab/window
   - [x] Verify both users see "Users: 2/2"
   - [x] Draw with pen in tab 1, verify stroke appears in tab 2 in real-time
   - [x] Change color, draw again, verify color syncs
   - [x] Use eraser in tab 2, verify eraser works and syncs to tab 1
   - [x] Draw complex shape, verify smooth rendering on both sides

4. **Room Full Enforcement**:
   - [ ] Open same room URL in third browser tab
   - [ ] Verify "Room is full" message appears
   - [ ] Verify third user is redirected to landing page

5. **Persistence & Reconnection**:
   - [x] With strokes on canvas, refresh tab 1
   - [x] Verify all completed strokes reload from storage
   - [x] Continue drawing, verify new strokes sync to tab 2

6. **User Departure**:
   - [x] Close tab 1
   - [x] Verify tab 2 shows "Users: 1/2"
   - [x] Verify tab 2 can still draw

7. **Audio** (if implemented):
   - [ ] Click "Start Audio" in both tabs - PLACEHOLDER ONLY
   - [ ] Grant microphone permissions - NOT IMPLEMENTED
   - [ ] Speak in tab 1, verify audio heard in tab 2 - NOT IMPLEMENTED
   - [ ] Verify mute/unmute works - NOT IMPLEMENTED

8. **TTL & Cleanup**:
   - [ ] Create new room, note timestamp - IMPLEMENTED BUT NOT TESTED
   - [ ] Wait >1 hour (or temporarily reduce TTL to 1 minute for testing)
   - [ ] Verify room is cleaned up and strokes deleted

### Console Testing
Check browser DevTools console for:
- [ ] No JavaScript errors
- [ ] WebSocket connection established messages
- [ ] Stroke broadcast messages logged
- [ ] User join/leave events logged

### Network Testing
Check browser DevTools Network tab:
- [ ] WebSocket connection to `/room/{roomId}/ws` successful (status 101)
- [ ] Static assets (CSS, JS) load successfully
- [ ] POST /room returns valid JSON with roomId

### Edge Cases
- [ ] Invalid room ID format (e.g., /room/invalid!!!) returns error
- [ ] Rapid drawing events (scribble fast) handled without lag
- [ ] WebSocket reconnection after network interruption works
- [ ] Drawing with different brush sizes/colors works correctly

### Performance Checks
- [ ] Canvas rendering smooth at 60fps
- [ ] WebSocket messages send/receive < 100ms latency
- [ ] Page load time < 2 seconds
- [ ] No memory leaks after 10 minutes of drawing

### Deployment Verification
After `bun run deploy`:
```bash
# Test deployed version
curl -X POST https://pairwise.vivekn.dev/room
# Should return JSON with roomId

# Visit in browser
open https://pairwise.vivekn.dev
```

- [ ] Production deployment works identically to local
- [ ] HTTPS WebSocket (wss://) connections work
- [ ] Cloudflare Realtime SFU audio works in production
- [ ] Cross-region latency acceptable (< 200ms)
