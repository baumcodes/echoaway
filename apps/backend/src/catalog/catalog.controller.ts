import { Controller, Get, Query } from '@nestjs/common'
import { CatalogService } from './catalog.service.js'

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('destinations')
  destinations(@Query('countryCode') countryCode?: string) {
    return this.catalog.listDestinations(countryCode)
  }

  @Get('accommodations')
  accommodations(@Query('destinationId') destinationId?: string) {
    return this.catalog.listAccommodations(destinationId)
  }

  @Get('activities')
  activities(@Query('destinationId') destinationId?: string) {
    return this.catalog.listActivities(destinationId)
  }

  @Get('flight-routes')
  flightRoutes(
    @Query('fromIata') fromIata?: string,
    @Query('toIata') toIata?: string,
  ) {
    return this.catalog.listFlightRoutes(fromIata, toIata)
  }

  @Get('transfers')
  transfers(@Query('fromAirportId') fromAirportId?: string) {
    return this.catalog.listTransfers(fromAirportId)
  }
}
