import { prisma, j } from '../shared/db.js'
import { dataset } from '../shared/dataset.js'
import { makeAirportByIataLookup, matchSupplier } from './shared.js'

export async function seedFlightRoutes(): Promise<void> {
  const airports = await prisma.airport.findMany({
    select: { id: true, iataCode: true },
  })
  const airportByIata = makeAirportByIataLookup(airports)

  const supplierId = matchSupplier('Airline Aggregator')
  if (!supplierId) {
    throw new Error(
      'Airline Aggregator supplier missing — seed suppliers first',
    )
  }

  for (const src of dataset.flightRoutes()) {
    const fromAirportId = airportByIata(src.from)
    const toAirportId = airportByIata(src.to)
    if (!fromAirportId || !toAirportId) {
      throw new Error(
        `Flight route ${src._id} references unknown airport: ${src.from} → ${src.to}`,
      )
    }
    const product = {
      id: src._id,
      fromAirportId,
      toAirportId,
      supplierId,
      stops: src.stops,
      daysOfWeek: j(src.days_of_week),
      priceAvgCents: src.price_avg * 100,
      currency: src.currency ?? 'EUR',
      fareConditions: src.fare_conditions,
      durationHours: src.duration_hours,
    }
    await prisma.flightRouteProduct.upsert({
      where: { id: src._id },
      create: product,
      update: {
        fromAirportId: product.fromAirportId,
        toAirportId: product.toAirportId,
        supplierId: product.supplierId,
        stops: product.stops,
        daysOfWeek: product.daysOfWeek,
        priceAvgCents: product.priceAvgCents,
        currency: product.currency,
        fareConditions: product.fareConditions,
        durationHours: product.durationHours,
      },
    })

    // Legs are deterministic ids derived from product._id + index so reseeding
    // upserts cleanly.
    for (let i = 0; i < src.legs.length; i++) {
      const leg = src.legs[i]
      const legFromAirportId = airportByIata(leg.from)
      const legToAirportId = airportByIata(leg.to)
      if (!legFromAirportId || !legToAirportId) {
        throw new Error(
          `Leg ${i + 1} of ${src._id} references unknown airport: ${leg.from} → ${leg.to}`,
        )
      }
      const id = `${src._id}-leg-${i + 1}`
      await prisma.flightRouteLeg.upsert({
        where: { id },
        create: {
          id,
          flightRouteProductId: src._id,
          order: i + 1,
          fromAirportId: legFromAirportId,
          toAirportId: legToAirportId,
          flightNo: leg.flight_no,
          airline: leg.airline,
          depTime: leg.dep_time,
          arrTime: leg.arr_time,
        },
        update: {
          order: i + 1,
          fromAirportId: legFromAirportId,
          toAirportId: legToAirportId,
          flightNo: leg.flight_no,
          airline: leg.airline,
          depTime: leg.dep_time,
          arrTime: leg.arr_time,
        },
      })
    }
  }
}
