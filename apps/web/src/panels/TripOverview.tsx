import { useDemo } from '@echoaway/app'
import { TripOverviewCard } from '@echoaway/ui'

/** Trip header card — title, dates, traveler line. Sits at the top of
 *  the phone screen above the assistant overlay + booking pager. */
export function TripOverview() {
  const { trip } = useDemo()
  if (!trip) return null
  return <TripOverviewCard trip={trip} />
}
