import { z } from 'zod'

export const voiceTokenRequestSchema = z.object({
  /** Identity used inside the LiveKit room — the web app's traveler id. */
  identity: z.string().min(1),
  /** Display name shown to other room participants. */
  name: z.string().optional(),
  /** Room to join. Optional; defaults to the env-configured demo room. */
  room: z.string().optional(),
  /** Participant metadata attached to the token. The worker reads this
   *  to resolve `tripId` / `sessionId` without an extra HTTP round-trip. */
  metadata: z
    .object({
      tripId: z.string().optional(),
      sessionId: z.string().optional(),
    })
    .optional(),
})
export type VoiceTokenRequest = z.infer<typeof voiceTokenRequestSchema>
