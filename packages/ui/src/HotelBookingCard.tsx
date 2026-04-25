import type { TripComponent } from '@echoaway/app'
import { Card } from './Card.js'
import { formatDayShort, formatPriceCents } from './format.js'

export type HotelBookingCardProps = {
  hotel: TripComponent
}

export function HotelBookingCard({ hotel }: HotelBookingCardProps) {
  const data =
    hotel.booking?.data && hotel.booking.data.kind === 'accommodation'
      ? hotel.booking.data
      : null
  const name = data?.productSnapshot.name ?? hotel.title
  const stars = data?.productSnapshot.stars ?? 0
  const isChanged = hotel.status === 'changed'

  return (
    <Card accent={isChanged ? 'success' : 'default'}>
      <div className="hotel-card">
        <div className="hotel-header">
          <div>
            <div className="label">Stay</div>
            <h3>{name}</h3>
          </div>
          {stars > 0 && (
            <div className="stars" aria-label={`${stars} stars`}>
              {'★'.repeat(stars)}
              <span className="stars-dim">{'★'.repeat(5 - stars)}</span>
            </div>
          )}
        </div>
        {data && (
          <div className="hotel-dates">
            <div>
              <div className="label">Check-in</div>
              <strong>{formatDayShort(data.checkInDate)}</strong>
            </div>
            <div>
              <div className="label">Check-out</div>
              <strong>{formatDayShort(data.checkOutDate)}</strong>
            </div>
            <div>
              <div className="label">Nights</div>
              <strong>{data.nights}</strong>
            </div>
            <div>
              <div className="label">Total</div>
              <strong>
                {formatPriceCents(
                  data.totalPriceCents,
                  data.productSnapshot.currency,
                )}
              </strong>
            </div>
          </div>
        )}
        {isChanged && (
          <div className="badge badge-success">Updated by EchoAway</div>
        )}
      </div>
    </Card>
  )
}
