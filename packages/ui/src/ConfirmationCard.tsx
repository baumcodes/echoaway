import type { ChangeQuote } from '@echoaway/app'
import { Card } from './Card.js'

export type ConfirmationCardProps = {
  quote: ChangeQuote
}

export function ConfirmationCard({ quote }: ConfirmationCardProps) {
  return (
    <Card accent="success" title="Change confirmed">
      <div className="confirmation-card">
        <p>
          Hotel check-in moved from <strong>{quote.oldValue}</strong> to{' '}
          <strong>{quote.newValue}</strong>.
        </p>
        <p className="confirmation-meta">
          {quote.feeCents === 0 ? 'No fee.' : `Fee: €${quote.feeCents / 100}.`}{' '}
          Support log created automatically.
        </p>
      </div>
    </Card>
  )
}
