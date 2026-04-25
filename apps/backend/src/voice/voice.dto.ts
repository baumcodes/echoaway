import { z } from 'zod'

export const voiceTokenRequestSchema = z.object({
  /** Identity used inside the LiveKit room — the web app's traveler id. */
  identity: z.string().min(1),
  /** Display name shown to other room participants. */
  name: z.string().optional(),
  /** Room to join. Optional; defaults to the env-configured demo room. */
  room: z.string().optional(),
})
export type VoiceTokenRequest = z.infer<typeof voiceTokenRequestSchema>
