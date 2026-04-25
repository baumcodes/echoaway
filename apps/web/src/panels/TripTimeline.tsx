import { useDemo } from '@echoaway/app'
import { TimelineEventList } from '@echoaway/ui'

/** Chronological event list for the whole trip. Lives at the bottom of
 *  the phone screen — long content, scrollable. */
export function TripTimeline() {
  const { trip } = useDemo()
  if (!trip) return null
  return <TimelineEventList components={trip.components} />
}
