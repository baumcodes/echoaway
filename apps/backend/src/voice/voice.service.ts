import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { AccessToken } from 'livekit-server-sdk'
import type { VoiceTokenRequest } from './voice.dto.js'

const DEFAULT_ROOM = 'echoaway-demo'
const TOKEN_TTL_SECONDS = 60 * 60 // 1h is plenty for a demo session

@Injectable()
export class VoiceService {
  /**
   * Mints a LiveKit access token so the web app can join the agent's room.
   * Required env vars (loaded from root `.env`):
   *   LIVEKIT_URL          — wss://… project URL (echoed back to the client)
   *   LIVEKIT_API_KEY      — server key
   *   LIVEKIT_API_SECRET   — server secret
   */
  async mintToken(req: VoiceTokenRequest) {
    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    const url = process.env.LIVEKIT_URL
    if (!apiKey || !apiSecret || !url) {
      throw new InternalServerErrorException(
        'LiveKit env not configured (LIVEKIT_URL/API_KEY/API_SECRET)',
      )
    }

    const room = req.room ?? DEFAULT_ROOM
    const at = new AccessToken(apiKey, apiSecret, {
      identity: req.identity,
      name: req.name,
      ttl: TOKEN_TTL_SECONDS,
      // Stringify metadata so the agent worker can JSON.parse it on the
      // other side. Empty object if caller didn't pass one.
      metadata: JSON.stringify(req.metadata ?? {}),
    })
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })
    const token = await at.toJwt()
    return { token, url, room, identity: req.identity }
  }
}
