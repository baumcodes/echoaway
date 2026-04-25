import type { ChangeQuote } from '@echoaway/types'
import { selectProposedNewCheckIn } from './selectors.js'
import { tools, type ToolContext } from './tools/index.js'

export type ScriptTurn = {
  speaker: 'user' | 'assistant'
  text: string
  toolCall?: {
    name: keyof typeof tools
    args: Record<string, unknown>
  }
}

export type PauseDecision = 'confirm' | 'reject'

export type ScriptHooks = {
  /** Fires for every turn as it's produced — user lines, assistant lines,
   *  and assistant lines that wrap a tool call. Lets a UI stream
   *  transcripts in real time without waiting for the script to finish. */
  onTurn?: (turn: ScriptTurn) => void
  /** Fires immediately after the quote tool returns. The web hook uses
   *  this to advance the assistant state synchronously — the same SSE
   *  event arrives a moment later but the reducer is idempotent so the
   *  duplicate is a no-op. The voice-agent CLI ignores this and relies
   *  on the backend's SSE alone. */
  onQuote?: (quote: ChangeQuote) => void
  /** Mirrors `onQuote` for the post-confirm path. */
  onConfirm?: (quote: ChangeQuote) => void
  /** Pauses between the quote and the confirm so a human can decide.
   *  Receives the just-computed `ChangeQuote` so a UI hook can dispatch
   *  `change_suggested` (or open a confirmation card) optimistically —
   *  not all environments will have an SSE stream wired (tests, RN
   *  cold-start). Resolve `'confirm'` to apply the change, `'reject'`
   *  to back out. When omitted the script auto-confirms (CLI / replay
   *  behavior). */
  pauseBeforeConfirm?: (quote: ChangeQuote) => Promise<PauseDecision>
}

export type ScriptOptions = ScriptHooks & {
  /** Phone number to look up. Defaults to the seeded lead traveler. */
  phoneNumber?: string
}

export type ScriptResult = {
  turns: ScriptTurn[]
  transcript: string
  outcome: 'confirmed' | 'rejected'
}

/**
 * Deterministic replay of ONE specific demo flow ("flight delayed →
 * shift hotel check-in by one day"). Hard-coded prompts + real tool
 * calls; no model, no API key, no risk of hallucination — useful as a
 * fallback when Gemini is offline and as a baseline test fixture.
 *
 * **This is one example, not the agent's full surface.** The real agent
 * (`apps/voice-agent/src/agent/agent.ts`) handles arbitrary travel
 * requests by composing whatever tools are registered in `./tools/`.
 * As new tools land (hotel swaps, activity reschedules, etc.), do NOT
 * extend this script to cover them — add new scripts (or just rely on
 * the live agent). This file's job is to keep the canonical "wow
 * moment" reproducible.
 *
 * Two consumers today: the voice-agent's `yarn script` command (auto-
 * confirms via no `pauseBeforeConfirm`) and the web app's "Talk to Away"
 * debug button (passes `pauseBeforeConfirm` so the UI's Confirm/Reject
 * buttons control the outcome).
 */
export async function runDemoScript(
  ctx: ToolContext,
  opts: ScriptOptions = {},
): Promise<ScriptResult> {
  const phoneNumber = opts.phoneNumber ?? '+4915112345678'
  const turns: ScriptTurn[] = []
  const emit = (turn: ScriptTurn) => {
    turns.push(turn)
    opts.onTurn?.(turn)
  }

  // 1 — user opens with the canonical request
  emit({
    speaker: 'user',
    text: 'Hey, my flight to Barcelona is delayed. Can you check if I can move my hotel check-in to tomorrow?',
  })

  // 2 — agent loads the trip
  const tripResult = (await tools.getTripByPhone.execute(
    { phoneNumber },
    ctx,
  )) as {
    title: string
    startDate: string
    endDate: string
  }
  emit({
    speaker: 'assistant',
    text: `I found your "${tripResult.title}". Let me check what's open on it.`,
    toolCall: { name: 'getTripByPhone', args: { phoneNumber } },
  })

  // 3 — agent reads disruptions
  const disruptions = (await tools.getTripDisruptions.execute(
    {},
    ctx,
  )) as Array<{ type: string; severity: string; message: string }>
  const flightDelay = disruptions.find((d) => d.type === 'flight_delay')
  emit({
    speaker: 'assistant',
    text: flightDelay
      ? `Yes — your flight is showing a ${flightDelay.severity} ${flightDelay.type.replace('_', ' ')}. Let me see what your hotel allows.`
      : `I don't see any open disruptions on your trip.`,
    toolCall: { name: 'getTripDisruptions', args: {} },
  })

  // 4 — quote the +1 day shift. Reuse the canonical selector so the
  //     web hook and the script agree on the proposed date.
  const trip = await ctx.apiClient.getTripById(ctx.tripId!)
  const newCheckIn = selectProposedNewCheckIn(trip)
  if (!newCheckIn) {
    throw new Error(
      'Demo script could not read current hotel check-in date from the trip',
    )
  }
  const quote = (await tools.quoteHotelCheckInChange.execute(
    { newCheckInDate: newCheckIn },
    ctx,
  )) as ChangeQuote
  opts.onQuote?.(quote)

  emit({
    speaker: 'assistant',
    text:
      quote.feeCents === 0
        ? `Good news — moving check-in from ${quote.oldValue} to ${quote.newValue} is free. ${quote.policySummary} Shall I confirm?`
        : `Moving check-in from ${quote.oldValue} to ${quote.newValue} would cost €${(quote.feeCents / 100).toFixed(0)}. ${quote.policySummary} Shall I confirm?`,
    toolCall: {
      name: 'quoteHotelCheckInChange',
      args: { newCheckInDate: newCheckIn },
    },
  })

  // 5 — pause for the human decision (or auto-confirm on the CLI path)
  const decision: PauseDecision = opts.pauseBeforeConfirm
    ? await opts.pauseBeforeConfirm(quote as unknown as ChangeQuote)
    : 'confirm'

  let outcome: ScriptResult['outcome']
  const actions: string[] = ['quoteHotelCheckInChange']

  if (decision === 'reject') {
    outcome = 'rejected'
    emit({ speaker: 'user', text: 'Actually, let me keep it as is.' })
    emit({
      speaker: 'assistant',
      text: `No problem — I left your check-in on ${quote.oldValue}.`,
    })
  } else {
    outcome = 'confirmed'
    emit({ speaker: 'user', text: 'Yes, please confirm.' })
    await tools.confirmHotelCheckInChange.execute(
      { newCheckInDate: newCheckIn },
      ctx,
    )
    actions.push('confirmHotelCheckInChange')
    opts.onConfirm?.(quote)
    emit({
      speaker: 'assistant',
      text: `Done — your check-in is now ${quote.newValue}. The change is showing in the app.`,
      toolCall: {
        name: 'confirmHotelCheckInChange',
        args: { newCheckInDate: newCheckIn },
      },
    })
  }

  // 6 — wrap up: support log either way so the operator has a record
  const transcript = turns
    .map((t) => `${t.speaker.toUpperCase()}: ${t.text}`)
    .join('\n')
  await tools.createSupportLog.execute(
    {
      transcript,
      summary:
        outcome === 'confirmed'
          ? `Hotel check-in for "${tripResult.title}" moved to ${quote.newValue}; €${(quote.feeCents / 100).toFixed(0)} fee.`
          : `Traveler declined the suggested ${quote.oldValue} → ${quote.newValue} hotel check-in change.`,
      actions,
    },
    ctx,
  )

  emit({
    speaker: 'assistant',
    text: 'I saved a quick summary to your support log. Have a great trip!',
    toolCall: {
      name: 'createSupportLog',
      args: { /* recorded above */ },
    },
  })

  return { turns, transcript, outcome }
}
