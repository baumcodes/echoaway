import { Body, Controller, Param, Post } from '@nestjs/common'
import { ZodValidationPipe } from '../zod.pipe.js'
import {
  type ConfirmTripCandidateRequest,
  confirmTripCandidateRequestSchema,
} from './trips.dto.js'
import { TripsService } from './trips.service.js'

const confirmCandidatePipe = new ZodValidationPipe(
  confirmTripCandidateRequestSchema,
)

/**
 * Companion to `GET /trips/search`. The search endpoint returns
 * candidate IDs only; the verifier check (last-N phone digits or a
 * fragment of the email) lives here so the agent never sees the raw
 * personal data — it just gets `success / no` plus, on success, the
 * full trip payload.
 */
@Controller('trip-candidates')
export class TripCandidatesController {
  constructor(private readonly trips: TripsService) {}

  @Post(':candidateId/confirm')
  confirm(
    @Param('candidateId') candidateId: string,
    @Body(confirmCandidatePipe) body: ConfirmTripCandidateRequest,
  ) {
    return this.trips.confirmTripCandidate(
      candidateId,
      body.verifier,
      body.sessionId,
    )
  }
}
