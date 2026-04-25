import { z } from 'zod'

export const hotelChangeRequestSchema = z.object({
  /** Target check-in date in YYYY-MM-DD. */
  newCheckInDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  /** Optional voice session id; if present we persist a VoiceActionEvent. */
  sessionId: z.string().optional(),
})
export type HotelChangeRequest = z.infer<typeof hotelChangeRequestSchema>
