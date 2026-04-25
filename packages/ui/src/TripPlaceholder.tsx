import { Card } from './Card.js'

/**
 * Empty-state card shown inside the phone shell when no trip is
 * loaded. Tells the user how to make a trip appear (talk to the
 * agent). Disappears as soon as the agent loads a trip via one of the
 * lookup tools and the backend pushes a `trip_loaded` SSE event.
 */
export function TripPlaceholder() {
  return (
    <Card>
      <div className="trip-placeholder">
        <div className="trip-placeholder-glyph" aria-hidden>
          ✈
        </div>
        <h3>No trip loaded</h3>
        <p>
          Tell Remí your phone, email, name, or booking reference and your
          trip will appear here.
        </p>
      </div>
    </Card>
  )
}
