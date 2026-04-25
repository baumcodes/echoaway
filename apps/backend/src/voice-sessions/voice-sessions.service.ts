import { Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { stringifyJson } from '../json.js'
import { PrismaService } from '../prisma.service.js'
import { VoiceEventsBus } from '../events/voice-events.bus.js'
import type { CreateVoiceSessionRequest } from './voice-sessions.dto.js'

@Injectable()
export class VoiceSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: VoiceEventsBus,
  ) {}

  async create(req: CreateVoiceSessionRequest) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: req.tripId },
      select: { id: true },
    })
    if (!trip) throw new NotFoundException(`Trip ${req.tripId} not found`)

    const session = await this.prisma.voiceSession.create({
      data: {
        id: randomUUID(),
        tripId: req.tripId,
        travelerId: req.travelerId ?? null,
        status: req.status ?? 'active',
      },
    })

    // Persist + broadcast a session_started event so clients that
    // subscribed before the session existed get the full timeline.
    const eventId = randomUUID()
    const payload = {
      type: 'session_started',
      sessionId: session.id,
      tripId: session.tripId,
    }
    const row = await this.prisma.voiceActionEvent.create({
      data: {
        id: eventId,
        sessionId: session.id,
        tripId: session.tripId,
        type: 'session_started',
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

    return {
      id: session.id,
      tripId: session.tripId,
      travelerId: session.travelerId,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
    }
  }
}
