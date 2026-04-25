import type { Trip, TripTraveler } from '@echoaway/app'
import { Card } from './Card.js'
import { formatDayShort } from './format.js'

export type TripOverviewCardProps = {
  trip: Trip
}

function travelerLabel(travelers: TripTraveler[]): string {
  if (travelers.length === 0) return 'No travelers'
  const lead = travelers.find((t) => t.role === 'lead')
  const others = travelers.length - 1
  const leadName = (lead ?? travelers[0])!.traveler.fullName
  return others > 0
    ? `${leadName} +${others} ${others === 1 ? 'companion' : 'companions'}`
    : leadName
}

export function TripOverviewCard({ trip }: TripOverviewCardProps) {
  return (
    <Card>
      <div className="trip-overview">
        <div className="trip-overview-eyebrow">
          {trip.status.toUpperCase()}
        </div>
        <h2 className="trip-overview-title">{trip.title}</h2>
        <p className="trip-overview-meta">
          {formatDayShort(trip.startDate)} – {formatDayShort(trip.endDate)} ·{' '}
          {travelerLabel(trip.travelers)}
        </p>
      </div>
    </Card>
  )
}
