import { z } from 'zod'

export const postTranscriptSchema = z.object({
  sessionId: z.string().min(1),
  tripId: z.string().min(1).nullable().optional(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  isFinal: z.boolean().optional(),
})
export type PostTranscriptRequest = z.infer<typeof postTranscriptSchema>
