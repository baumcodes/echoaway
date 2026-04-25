import type { ChangeQuote } from '@echoaway/app'
import { Card } from './Card.js'
import { formatPriceCents } from './format.js'

export type AssistantActionCardProps = {
  quote: ChangeQuote
  onConfirm: () => void
  onReject: () => void
  busy?: boolean
}

export function AssistantActionCard({
  quote,
  onConfirm,
  onReject,
  busy,
}: AssistantActionCardProps) {
  return (
    <Card accent="info" title="Suggested change">
      <div className="action-card">
        <div className="action-grid">
          <div>
            <div className="label">Old check-in</div>
            <strong>{quote.oldValue}</strong>
          </div>
          <div>
            <div className="label">New check-in</div>
            <strong>{quote.newValue}</strong>
          </div>
          <div>
            <div className="label">Fee</div>
            <strong>
              {quote.feeCents === 0
                ? 'Free'
                : formatPriceCents(quote.feeCents, quote.currency)}
            </strong>
          </div>
        </div>
        <p className="action-policy">{quote.policySummary}</p>
        <div className="action-buttons">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={busy}
          >
            Confirm change
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onReject}
            disabled={busy}
          >
            Keep original
          </button>
        </div>
      </div>
    </Card>
  )
}
