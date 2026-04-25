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

export const confirmTripCandidateRequestSchema = z.object({
  /** Free-form verifier — e.g. last 3 digits of phone or fragment of
   *  the email's local part. The service decides what counts as a
   *  match; the caller doesn't need to know which kind of verifier
   *  the candidate has on file. */
  verifier: z.string().min(2).max(64),
  /** Optional voice session id; when present the service emits a
   *  trip_loaded VoiceActionEvent on success so the web UI can
   *  trigger its render. */
  sessionId: z.string().optional(),
})
export type ConfirmTripCandidateRequest = z.infer<
  typeof confirmTripCandidateRequestSchema
>
