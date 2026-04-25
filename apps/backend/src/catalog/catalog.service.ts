import { Injectable } from '@nestjs/common'
import { parseJson } from '../json.js'
import { PrismaService } from '../prisma.service.js'

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listDestinations(countryCode?: string) {
    const rows = await this.prisma.destination.findMany({
      where: countryCode ? { countryCode } : undefined,
      orderBy: { name: 'asc' },
    })
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      countryCode: d.countryCode,
      countryName: d.countryName,
      timezone: d.timezone,
      coordinates: parseJson(d.coordinates),
      summary: d.summary,
      tags: parseJson(d.tags),
    }))
  }

  async listAccommodations(destinationId?: string) {
    const rows = await this.prisma.accommodationProduct.findMany({
      where: destinationId ? { destinationId } : undefined,
      orderBy: { pricePerNightCents: 'asc' },
    })
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      destinationId: a.destinationId,
      stars: a.stars,
      pricePerNightCents: a.pricePerNightCents,
      currency: a.currency,
      coordinates: parseJson(a.coordinates),
      amenities: parseJson(a.amenities),
      images: parseJson(a.images),
      description: a.description,
    }))
  }

  async listActivities(destinationId?: string) {
    const rows = await this.prisma.activityProduct.findMany({
      where: destinationId ? { destinationId } : undefined,
      orderBy: { name: 'asc' },
    })
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      destinationId: a.destinationId,
      durationHours: a.durationHours,
      priceCents: a.priceCents,
      currency: a.currency,
      tags: parseJson(a.tags),
      description: a.description,
    }))
  }

  async listFlightRoutes(fromIata?: string, toIata?: string) {
    const where: Record<string, unknown> = {}
    if (fromIata) where['fromAirport'] = { iataCode: fromIata.toUpperCase() }
    if (toIata) where['toAirport'] = { iataCode: toIata.toUpperCase() }
    const rows = await this.prisma.flightRouteProduct.findMany({
      where,
      include: {
        legs: { orderBy: { order: 'asc' } },
        fromAirport: true,
        toAirport: true,
      },
    })
    return rows.map((r) => ({
      id: r.id,
      from: { id: r.fromAirport.id, iata: r.fromAirport.iataCode },
      to: { id: r.toAirport.id, iata: r.toAirport.iataCode },
      stops: r.stops,
      durationHours: r.durationHours,
      priceAvgCents: r.priceAvgCents,
      currency: r.currency,
      fareConditions: r.fareConditions,
      daysOfWeek: parseJson(r.daysOfWeek),
      legs: r.legs,
    }))
  }

  async listTransfers(fromAirportId?: string) {
    const rows = await this.prisma.groundTransferProduct.findMany({
      where: fromAirportId ? { fromAirportId } : undefined,
      orderBy: { priceCents: 'asc' },
    })
    return rows.map((t) => ({
      id: t.id,
      fromAirportId: t.fromAirportId,
      toAccommodationProductId: t.toAccommodationProductId,
      toDestinationId: t.toDestinationId,
      fromLabel: t.fromLabel,
      toLabel: t.toLabel,
      mode: t.mode,
      durationMinutes: t.durationMinutes,
      priceCents: t.priceCents,
      currency: t.currency,
      schedule: parseJson(t.schedule),
    }))
  }
}
