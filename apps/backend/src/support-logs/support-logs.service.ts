import { Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { VoiceEventsBus } from '../events/voice-events.bus.js'
import { stringifyJson } from '../json.js'
import { PrismaService } from '../prisma.service.js'
import type { CreateSupportLogRequest } from './support-logs.dto.js'

@Injectable()
export class SupportLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: VoiceEventsBus,
  ) {}

  async create(req: CreateSupportLogRequest) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: req.tripId },
      select: { id: true },
    })
    if (!trip) throw new NotFoundException(`Trip ${req.tripId} not found`)

    const log = await this.prisma.supportLog.create({
      data: {
        id: randomUUID(),
        tripId: req.tripId,
        sessionId: req.sessionId ?? null,
        transcript: req.transcript,
        summary: req.summary,
        actions: stringifyJson(req.actions ?? []),
      },
    })

    if (req.sessionId) {
      const eventId = randomUUID()
      const payload = {
        type: 'support_log_created' as const,
        sessionId: req.sessionId,
        supportLogId: log.id,
      }
      try {
        const row = await this.prisma.voiceActionEvent.create({
          data: {
            id: eventId,
            sessionId: req.sessionId,
            tripId: req.tripId,
            type: 'support_log_created',
            payload: stringifyJson(payload),
          },
        })
        this.bus.publish({
          id: row.id,
          type: row.type,
          sessionId: row.sessionId,
          tripId: row.tripId,
          componentId: row.componentId,
          payload,
          createdAt: row.createdAt.toISOString(),
        })
      } catch (err) {
        // Same fail-open posture as TripsService.persistVoiceEvent.
        // eslint-disable-next-line no-console
        console.warn(`[support-logs] could not persist event:`, err)
      }
    }

    return {
      id: log.id,
      tripId: log.tripId,
      sessionId: log.sessionId,
      transcript: log.transcript,
      summary: log.summary,
      actions: req.actions ?? [],
      createdAt: log.createdAt.toISOString(),
    }
  }
}
