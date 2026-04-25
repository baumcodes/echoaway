import { Injectable } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'

export type TranscriptRole = 'user' | 'assistant'

export type TranscriptEnvelope = {
  id: string
  sessionId: string
  tripId: string | null
  role: TranscriptRole
  text: string
  /** False for interim/streaming partials; true once the chunk is settled. */
  isFinal: boolean
  createdAt: string
}

/**
 * Ephemeral pub/sub for live transcript fragments. Unlike `VoiceEventsBus`,
 * transcripts are NOT persisted — they're a debug overlay. Workers push;
 * the SSE controller broadcasts; if no subscriber is listening the chunk
 * is dropped on the floor.
 */
@Injectable()
export class TranscriptsBus {
  private readonly subject = new Subject<TranscriptEnvelope>()

  publish(event: TranscriptEnvelope): void {
    this.subject.next(event)
  }

  stream(): Observable<TranscriptEnvelope> {
    return this.subject.asObservable()
  }
}
