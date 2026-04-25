import { prisma } from '../shared/db.js'
import { DEMO_TRIP_ID, DISRUPTION_ID } from './constants.js'

/**
 * Wipe just the demo trip (and everything that cascades from it).
 * Catalog rows and travelers are NOT touched — travelers are upserted
 * by the demo-trip seed itself, catalog by `seed:catalog`.
 *
 * Cascade chain (per schema.prisma):
 *   Trip → TripSegment, Component, TripTraveler, Disruption,
 *          VoiceSession, SupportLog, VoiceActionEvent
 *   Component → ComponentBooking, ComponentEvent
 */
export async function resetDemoTrip(): Promise<void> {
  // Disruption.affectedComponentId has no cascade rule, so explicit delete
  // first to avoid orphaning. Belt-and-braces.
  await prisma.disruption.deleteMany({ where: { id: DISRUPTION_ID } })
  await prisma.disruption.deleteMany({ where: { tripId: DEMO_TRIP_ID } })
  await prisma.trip.deleteMany({ where: { id: DEMO_TRIP_ID } })
}
