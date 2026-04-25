import { Controller, Get, Query, Sse, type MessageEvent } from '@nestjs/common'
import { type Observable, map } from 'rxjs'
import { parseJson } from '../json.js'
import { PrismaService } from '../prisma.service.js'
import { VoiceEventsBus, type VoiceEventEnvelope } from './voice-events.bus.js'

@Controller()
export class EventsController {
  constructor(
    private readonly bus: VoiceEventsBus,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Server-Sent Events stream of every persisted VoiceActionEvent.
   * Clients use `EventSource(`/events/stream`)`. The first event clients
   * miss before connecting can be backfilled via `GET /events?since=`.
   *
   * One stream serves every consumer — no per-trip filtering. Web clients
   * filter by `tripId` themselves (cheap; one trip per browser anyway).
   */
  @Sse('events/stream')
  stream(): Observable<MessageEvent> {
    return this.bus.stream().pipe(
      map((event: VoiceEventEnvelope): MessageEvent => ({
        type: event.type,
        data: event,
      })),
    )
  }

  /**
   * Polling fallback for environments without SSE (some corporate
   * proxies, native clients during cold start, tests). Returns events
   * created strictly after `since`. Capped at 200 rows.
   */
  @Get('events')
  async poll(
    @Query('since') since?: string,
    @Query('tripId') tripId?: string,
  ) {
    const where: Record<string, unknown> = {}
    if (since) {
      const sinceDate = new Date(since)
      if (!Number.isNaN(sinceDate.getTime())) {
        where['createdAt'] = { gt: sinceDate }
      }
    }
    if (tripId) where['tripId'] = tripId

    const rows = await this.prisma.voiceActionEvent.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      sessionId: r.sessionId,
      tripId: r.tripId,
      componentId: r.componentId,
      payload: parseJson(r.payload),
      createdAt: r.createdAt.toISOString(),
    }))
  }
}
