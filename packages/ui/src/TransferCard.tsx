import type { TripComponent } from '@echoaway/app'
import { Card } from './Card.js'
import { formatPriceCents, formatTime } from './format.js'

export type TransferCardProps = {
  transfer: TripComponent
}

export function TransferCard({ transfer }: TransferCardProps) {
  const data =
    transfer.booking?.data && transfer.booking.data.kind === 'transfer'
      ? transfer.booking.data
      : null
  const pickup = transfer.events.find((e) => e.type === 'pickup')
  return (
    <Card>
      <div className="transfer-card">
        <div className="label">Transfer</div>
        <h3>{transfer.title}</h3>
        {data && (
          <p className="transfer-meta">
            {data.productSnapshot.fromLabel} → {data.productSnapshot.toLabel}
            {' · '}
            {pickup ? `pickup ${formatTime(pickup.startsAt)}` : ''}
            {' · '}
            {formatPriceCents(
              data.totalPriceCents,
              data.productSnapshot.currency,
            )}
          </p>
        )}
      </div>
    </Card>
  )
}
