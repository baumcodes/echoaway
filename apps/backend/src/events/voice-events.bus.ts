import { Injectable } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'

export type VoiceEventEnvelope = {
  id: string
  type: string
  sessionId: string
  tripId: string | null
  componentId: string | null
  payload: unknown
  createdAt: string
}

/**
 * In-memory pub/sub for VoiceActionEvent rows. Single instance via
 * Nest DI; producers (TripsService, SupportLogsService) call
 * `publish()` after a successful row write, consumers (`EventsController`
 * SSE + polling) read via `stream()` / by querying Prisma.
 *
 * Survives a process restart only via the persisted rows — re-subscribing
 * clients use the polling endpoint with `?since=` to backfill.
 */
@Injectable()
export class VoiceEventsBus {
  private readonly subject = new Subject<VoiceEventEnvelope>()

  publish(event: VoiceEventEnvelope): void {
    this.subject.next(event)
  }

  stream(): Observable<VoiceEventEnvelope> {
    return this.subject.asObservable()
  }
}
