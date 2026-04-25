import type { TripComponent } from '@echoaway/app'
import { Card } from './Card.js'
import { formatDateTime } from './format.js'

export type TimelineEventListProps = {
  components: TripComponent[]
}

const eventLabel: Record<string, string> = {
  departure: 'Flight departure',
  arrival: 'Flight arrival',
  pickup: 'Transfer pickup',
  check_in: 'Hotel check-in',
  check_out: 'Hotel check-out',
  meeting_point: 'Meeting point',
  activity_start: 'Activity start',
  activity_end: 'Activity end',
}

export function TimelineEventList({ components }: TimelineEventListProps) {
  const events = components
    .flatMap((c) =>
      c.events.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        startsAt: e.startsAt,
      })),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  if (events.length === 0) return null

  return (
    <Card title="Itinerary">
      <ol className="timeline">
        {events.map((e) => (
          <li key={e.id} className="timeline-row">
            <div className="timeline-time">{formatDateTime(e.startsAt)}</div>
            <div className="timeline-detail">
              <div className="label">{eventLabel[e.type] ?? e.type}</div>
              <div>{e.title}</div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}
