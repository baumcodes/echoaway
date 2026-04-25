import {
  selectActivities,
  selectFlight,
  selectFlightDisruption,
  selectHotel,
  selectTransfer,
  useDemo,
} from '@echoaway/app'
import {
  ActivityCard,
  FlightDelayCard,
  HorizontalPager,
  HotelBookingCard,
  TransferCard,
} from '@echoaway/ui'

/** Swipeable carousel of bookable components. Sits below any agent-driven
 *  interactive cards (AssistantOverlay) so the agent's call-to-action stays
 *  pinned above the pager and visible without scrolling. */
export function BookingPager() {
  const { trip } = useDemo()
  if (!trip) return null

  const flight = selectFlight(trip)
  const transfer = selectTransfer(trip)
  const hotel = selectHotel(trip)
  const activities = selectActivities(trip)
  const flightDisruption = selectFlightDisruption(trip)

  return (
    <HorizontalPager ariaLabel="Booking cards">
      {flight && (
        <FlightDelayCard flight={flight} disruption={flightDisruption} />
      )}
      {hotel && <HotelBookingCard hotel={hotel} />}
      {transfer && <TransferCard transfer={transfer} />}
      {activities.map((a) => (
        <ActivityCard key={a.id} activity={a} />
      ))}
    </HorizontalPager>
  )
}
