import type { TripComponent, TripDisruption } from '@echoaway/app'
import { Card } from './Card.js'
import { formatDayShort, formatTime } from './format.js'

export type FlightDelayCardProps = {
  flight: TripComponent
  disruption: TripDisruption | null
}

export function FlightDelayCard({ flight, disruption }: FlightDelayCardProps) {
  const data =
    flight.booking?.data && flight.booking.data.kind === 'flight'
      ? flight.booking.data
      : null
  const departure = flight.events.find((e) => e.type === 'departure')
  const arrival = flight.events.find((e) => e.type === 'arrival')

  const fromIata = data?.routeSnapshot.fromIata ?? '—'
  const toIata = data?.routeSnapshot.toIata ?? '—'
  const flightNo = data?.legs[0]?.flightNo ?? ''
  const airline = data?.legs[0]?.airline ?? ''
  const isDelayed = disruption?.type === 'flight_delay'

  return (
    <Card accent={isDelayed ? 'warning' : 'default'}>
      <div className="flight-card">
        <div className="flight-route">
          <span className="iata">{fromIata}</span>
          <span className="flight-arrow" aria-hidden>
            ✈
          </span>
          <span className="iata">{toIata}</span>
        </div>
        <div className="flight-meta">
          {airline} {flightNo && <code>{flightNo}</code>}
        </div>
        {departure && arrival && (
          <div className="flight-times">
            <div>
              <div className="label">Depart</div>
              <div>
                {formatDayShort(departure.startsAt)}{' '}
                <strong>{formatTime(departure.startsAt)}</strong>
              </div>
            </div>
            <div>
              <div className="label">Arrive</div>
              <div>
                {formatDayShort(arrival.startsAt)}{' '}
                <strong>{formatTime(arrival.startsAt)}</strong>
              </div>
            </div>
          </div>
        )}
        {isDelayed && disruption && (
          <div className="flight-disruption">
            <div className="badge badge-warning">Delayed</div>
            <p>{disruption.message}</p>
          </div>
        )}
      </div>
    </Card>
  )
}
