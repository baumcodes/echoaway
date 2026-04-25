import {
  Body,
  Controller,
  HttpCode,
  Post,
  Sse,
  type MessageEvent,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { type Observable, map } from 'rxjs'
import { ZodValidationPipe } from '../zod.pipe.js'
import {
  postTranscriptSchema,
  type PostTranscriptRequest,
} from './transcripts.dto.js'
import { TranscriptsBus, type TranscriptEnvelope } from './transcripts.bus.js'

const postPipe = new ZodValidationPipe(postTranscriptSchema)

@Controller('transcripts')
export class TranscriptsController {
  constructor(private readonly bus: TranscriptsBus) {}

  /**
   * Worker pushes user + assistant transcript fragments here. We do NOT
   * persist them — they're a live debug overlay. Each call is fire-and-
   * forget: the bus broadcasts to active SSE subscribers and the row
   * is dropped after the broadcast.
   */
  @Post()
  @HttpCode(202)
  publish(@Body(postPipe) body: PostTranscriptRequest) {
    const envelope: TranscriptEnvelope = {
      id: randomUUID(),
      sessionId: body.sessionId,
      tripId: body.tripId ?? null,
      role: body.role,
      text: body.text,
      isFinal: body.isFinal ?? true,
      createdAt: new Date().toISOString(),
    }
    this.bus.publish(envelope)
    return { ok: true }
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.bus.stream().pipe(
      map((env): MessageEvent => ({
        type: 'transcript',
        data: env,
      })),
    )
  }
}
