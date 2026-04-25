import type {
  ApiClient,
  TranscriptEnvelope,
  VoiceEventEnvelope,
} from './client.js'
import type { AssistantEvent } from './state-machine.js'

export type EventStreamHandlers = {
  onEvent: (envelope: VoiceEventEnvelope) => void
  onError?: (err: Error) => void
}

export type TranscriptStreamHandlers = {
  onTranscript: (envelope: TranscriptEnvelope) => void
  onError?: (err: Error) => void
}

/**
 * Subscribes to the backend SSE stream. Returns a teardown.
 *
 * Resilience contract:
 *   - On open, no action (the caller already backfilled via polling
 *     before subscribing if it cared).
 *   - On error, native `EventSource` already retries with exponential
 *     backoff. We forward the error so the caller can surface a banner
 *     but keep the connection alive.
 *   - When `EventSource` is unavailable (SSR, RN), the caller should
 *     fall back to `pollEvents()` on a timer.
 */
export function subscribeToEvents(
  apiClient: ApiClient,
  handlers: EventStreamHandlers,
): () => void {
  if (typeof EventSource === 'undefined') {
    // Caller should poll instead — return a no-op teardown.
    return () => {}
  }
  const source = new EventSource(apiClient.eventStreamUrl())
  const onMessage = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as VoiceEventEnvelope
      handlers.onEvent(data)
    } catch (err) {
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }
  const onError = () => {
    handlers.onError?.(new Error('Event stream connection error'))
  }
  source.addEventListener('message', onMessage)
  source.addEventListener('error', onError)
  return () => {
    source.removeEventListener('message', onMessage)
    source.removeEventListener('error', onError)
    source.close()
  }
}

/**
 * Subscribes to the backend transcript SSE stream. Same resilience
 * contract as `subscribeToEvents` — `EventSource` retries on its own,
 * we forward errors but keep the connection alive.
 *
 * Transcripts are not persisted, so there's no polling fallback — when
 * SSE is unavailable the consumer simply has no live overlay.
 */
export function subscribeToTranscripts(
  apiClient: ApiClient,
  handlers: TranscriptStreamHandlers,
): () => void {
  if (typeof EventSource === 'undefined') return () => {}
  const source = new EventSource(apiClient.transcriptStreamUrl())
  const onMessage = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as TranscriptEnvelope
      handlers.onTranscript(data)
    } catch (err) {
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }
  const onError = () => {
    handlers.onError?.(new Error('Transcript stream connection error'))
  }
  // The controller emits with `event: transcript` rather than the default
  // `message` event, so listen for both — `message` is the fallback if
  // the SSE serializer ever changes.
  source.addEventListener('transcript', onMessage as EventListener)
  source.addEventListener('message', onMessage)
  source.addEventListener('error', onError)
  return () => {
    source.removeEventListener('transcript', onMessage as EventListener)
    source.removeEventListener('message', onMessage)
    source.removeEventListener('error', onError)
    source.close()
  }
}

/**
 * Map a raw VoiceActionEvent envelope to the assistant reducer's event
 * shape. Returns `null` for envelopes the UI doesn't drive state from
 * (e.g. `support_log_created` is informational; it doesn't change the
 * assistant view-state).
 *
 * Defensive parsing — payloads come from JSON over the wire and may be
 * shaped slightly differently if the backend version drifts. We extract
 * only the fields we need and let the rest pass through unread.
 */
export function envelopeToAssistantEvent(
  envelope: VoiceEventEnvelope,
): AssistantEvent | null {
  const payload = envelope.payload as Record<string, unknown> | null
  switch (envelope.type) {
    case 'session_started':
      return { type: 'session_started' }
    case 'assistant_listening':
      return {
        type: 'listening',
        transcript:
          typeof payload?.['transcript'] === 'string'
            ? (payload['transcript'] as string)
            : undefined,
      }
    case 'assistant_thinking':
      return {
        type: 'thinking',
        intent:
          typeof payload?.['intent'] === 'string'
            ? (payload['intent'] as string)
            : undefined,
      }
    case 'change_suggested': {
      const quote = payload?.['quote']
      if (!quote || typeof quote !== 'object') return null
      return {
        type: 'change_suggested',
        // Trust the wire shape — the backend produces it from a Zod-
        // validated source; the reducer doesn't introspect quote fields
        // beyond passing them to the UI.
        quote: quote as AssistantEvent extends { type: 'change_suggested'; quote: infer Q }
          ? Q
          : never,
      }
    }
    case 'change_confirmed': {
      const quote = payload?.['quote']
      if (!quote || typeof quote !== 'object') return null
      return {
        type: 'change_confirmed',
        quote: quote as AssistantEvent extends { type: 'change_confirmed'; quote: infer Q }
          ? Q
          : never,
      }
    }
    case 'change_rejected':
      return {
        type: 'change_rejected',
        reason:
          typeof payload?.['reason'] === 'string'
            ? (payload['reason'] as string)
            : undefined,
      }
    case 'session_ended':
      return { type: 'session_ended' }
    default:
      return null
  }
}
