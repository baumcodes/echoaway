import { z } from 'zod'

export const createSupportLogSchema = z.object({
  tripId: z.string(),
  sessionId: z.string().optional(),
  transcript: z.string(),
  summary: z.string(),
  actions: z.array(z.string()).default([]),
})
export type CreateSupportLogRequest = z.infer<typeof createSupportLogSchema>
