import { z } from 'zod'

export const createVoiceSessionSchema = z.object({
  tripId: z.string().min(1),
  travelerId: z.string().optional(),
  status: z.enum(['active', 'ended', 'failed']).optional(),
})
export type CreateVoiceSessionRequest = z.infer<
  typeof createVoiceSessionSchema
>
