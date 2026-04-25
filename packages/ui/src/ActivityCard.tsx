import type { TripComponent } from '@echoaway/app'
import { Card } from './Card.js'
import { formatDayShort, formatPriceCents, formatTime } from './format.js'

export type ActivityCardProps = {
  activity: TripComponent
}

export function ActivityCard({ activity }: ActivityCardProps) {
  const data =
    activity.booking?.data && activity.booking.data.kind === 'activity'
      ? activity.booking.data
      : null
  const start = activity.events.find((e) => e.type === 'activity_start')
  return (
    <Card>
      <div className="activity-card">
        <div className="label">Activity</div>
        <h3>{data?.productSnapshot.name ?? activity.title}</h3>
        {start && (
          <p className="activity-meta">
            {formatDayShort(start.startsAt)} · {formatTime(start.startsAt)}
            {data && (
              <>
                {' · '}
                {formatPriceCents(
                  data.totalPriceCents,
                  data.productSnapshot.currency,
                )}
              </>
            )}
          </p>
        )}
        {data?.meetingPoint && (
          <p className="activity-location">{data.meetingPoint.name}</p>
        )}
      </div>
    </Card>
  )
}
