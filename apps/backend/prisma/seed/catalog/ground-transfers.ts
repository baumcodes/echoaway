import { prisma, j } from '../shared/db.js'
import { dataset } from '../shared/dataset.js'
import {
  iataFromLabel,
  makeAirportByIataLookup,
  makeDestinationByCityMatcher,
  matchSupplier,
  matchTransferMode,
} from './shared.js'

/**
 * Resolve a transfer "from" label like "BCN Airport" or "Valencia Airport"
 * to an Airport.id. Tries explicit IATA, then a city-prefix scan against the
 * Airport table.
 */
function makeAirportByLabelLookup(
  airports: { id: string; iataCode: string; city: string }[],
): (label: string) => string | null {
  const byIata = makeAirportByIataLookup(airports)
  const byCityNorm = new Map<string, string>()
  for (const a of airports) byCityNorm.set(a.city.toLowerCase(), a.id)
  return (label) => {
    const iata = iataFromLabel(label)
    if (iata) {
      const id = byIata(iata)
      if (id) return id
    }
    const lower = label.toLowerCase()
    for (const [city, id] of byCityNorm) {
      if (lower.startsWith(city)) return id
    }
    return null
  }
}

export async function seedGroundTransfers(): Promise<void> {
  const airports = await prisma.airport.findMany({
    select: { id: true, iataCode: true, city: true },
  })
  const airportByLabel = makeAirportByLabelLookup(airports)

  const destinations = await prisma.destination.findMany({
    select: { id: true, name: true },
  })
  const destinationByCity = makeDestinationByCityMatcher(destinations)

  const accommodations = await prisma.accommodationProduct.findMany({
    select: { id: true, name: true, destinationId: true },
  })
  const accByName = new Map(
    accommodations.map((a) => [a.name.toLowerCase().trim(), a]),
  )

  const supplierId = matchSupplier('Iberia Ground Transfers')
  if (!supplierId) {
    throw new Error('Iberia Ground Transfers supplier missing — seed suppliers first')
  }

  for (const src of dataset.groundTransfers()) {
    const matchedAccommodation =
      accByName.get(src.to.toLowerCase().trim()) ?? null
    const data = {
      id: src._id,
      fromAirportId: airportByLabel(src.from),
      toDestinationId:
        matchedAccommodation?.destinationId ?? destinationByCity(src.to),
      toAccommodationProductId: matchedAccommodation?.id ?? null,
      supplierId,
      fromLabel: src.from,
      toLabel: src.to,
      mode: matchTransferMode(src.mode),
      durationMinutes: src.duration_minutes,
      priceCents: src.price * 100,
      currency: src.currency ?? 'EUR',
      schedule: j(src.schedule ?? {}),
      description: src.description,
      contractRef: src.supplier.contract_ref,
    }
    await prisma.groundTransferProduct.upsert({
      where: { id: src._id },
      create: data,
      update: {
        fromAirportId: data.fromAirportId,
        toDestinationId: data.toDestinationId,
        toAccommodationProductId: data.toAccommodationProductId,
        supplierId: data.supplierId,
        fromLabel: data.fromLabel,
        toLabel: data.toLabel,
        mode: data.mode,
        durationMinutes: data.durationMinutes,
        priceCents: data.priceCents,
        currency: data.currency,
        schedule: data.schedule,
        description: data.description,
        contractRef: data.contractRef,
      },
    })
  }
}
