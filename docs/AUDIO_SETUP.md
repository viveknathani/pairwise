# Audio Setup Guide - Cloudflare Realtime SFU

## Overview

Audio is implemented using **Cloudflare Realtime SFU** (Selective Forwarding Unit) for WebRTC-based voice communication.

## Setup Steps

### 1. Get Cloudflare Realtime Credentials

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Calls** or **Realtime** section
3. Create a new Realtime application (if you don't have one)
4. Copy your:
   - **App ID** (e.g., `abc123def456`)
   - **API Key** (looks like a long hex string)

### 2. Configure Environment Variables

Add to `.env`:

```bash
REALTIME_SFU_API_KEY=your_api_key_here
REALTIME_APP_ID=your_app_id_here
```

### 3. For Production Deployment

Set secrets in Cloudflare:

```bash
wrangler secret put REALTIME_SFU_API_KEY
wrangler secret put REALTIME_APP_ID
```

## How It Works

### Architecture

```
Browser 1 → RTCPeerConnection → Cloudflare Realtime SFU ← RTCPeerConnection ← Browser 2
              ↑                                              ↑
              |                                              |
         Durable Object coordinates sessions and tracks
```

### Flow

1. **User clicks "Start Audio"**
   - Frontend requests mic permission
   - Creates session via `POST /room/{id}/sfu/session`

2. **Backend creates SFU session**
   - Durable Object calls Cloudflare Realtime API
   - Returns `sessionId` and existing peer tracks

3. **WebRTC Negotiation**
   - Frontend creates `RTCPeerConnection`
   - Adds local audio track
   - Creates offer, sends to `POST /room/{id}/sfu/offer`
   - Backend negotiates with SFU, returns answer
   - Connection established

4. **Peer Connection**
   - When second user joins, they subscribe to first user's track
   - SFU handles media routing globally
   - Audio flows peer-to-peer through Cloudflare's network

### Key Files

- **Backend**: `src/room.ts` - SFU session management
- **Frontend**: `public/js/audio.js` - WebRTC implementation
- **Routes**: `POST /room/:id/sfu/session`, `POST /room/:id/sfu/offer`

## Testing

1. Start dev server: `bun run dev`
2. Open room in two different browsers
3. Click "Start Audio" in both
4. Grant mic permissions
5. Speak - you should hear each other!

## Troubleshooting

### "Failed to create SFU session"
- Check `REALTIME_SFU_API_KEY` is set correctly
- Check `REALTIME_APP_ID` matches your Cloudflare app

### No audio heard
- Check browser console for WebRTC errors
- Verify mic permissions granted
- Check ICE connection state in console
- Ensure both users clicked "Start Audio"

### CORS or API errors
- Verify API key has correct permissions
- Check Cloudflare Realtime API status

## API Reference

- [Cloudflare Realtime Docs](https://developers.cloudflare.com/realtime/)
- [API Spec](https://developers.cloudflare.com/realtime/static/calls-api-2024-05-21.yaml)

## Limitations

- **2 users maximum** per room (enforced by room logic)
- **Audio only** (no video)
- **No recording** (ephemeral by design)
- **1-hour TTL** (room expires after 1 hour)
