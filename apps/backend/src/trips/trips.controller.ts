import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ZodValidationPipe } from '../zod.pipe.js'
import {
  type HotelChangeRequest,
  hotelChangeRequestSchema,
} from './trips.dto.js'
import { TripsService } from './trips.service.js'

const hotelChangePipe = new ZodValidationPipe(hotelChangeRequestSchema)

@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get('by-phone/:phoneNumber')
  byPhone(
    @Param('phoneNumber') phoneNumber: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.trips.getTripByPhone(phoneNumber, sessionId)
  }

  @Get('by-email/:email')
  byEmail(
    @Param('email') email: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.trips.getTripByEmail(email, sessionId)
  }

  // Path-segment lookup that tolerates dashes/spacing/casing. The
  // path is `/trips/by-id/:tripId` (rather than `/trips/:tripId`)
  // so the loose-match logic doesn't conflict with the exact-id
  // route below.
  @Get('by-id/:tripId')
  byIdLoose(
    @Param('tripId') tripId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.trips.getTripByIdLoose(tripId, sessionId)
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.trips.searchTrips(q ?? '')
  }

  @Get(':tripId')
  one(@Param('tripId') tripId: string) {
    return this.trips.getTripFull(tripId)
  }

  @Get(':tripId/disruptions')
  disruptions(@Param('tripId') tripId: string) {
    return this.trips.getDisruptions(tripId)
  }

  @Post(':tripId/hotel/check-in/quote-change')
  quoteHotelCheckInChange(
    @Param('tripId') tripId: string,
    @Body(hotelChangePipe) body: HotelChangeRequest,
  ) {
    return this.trips.quoteHotelCheckInChange({
      tripId,
      newCheckInDate: body.newCheckInDate,
      sessionId: body.sessionId,
    })
  }

  @Post(':tripId/hotel/check-in/confirm-change')
  confirmHotelCheckInChange(
    @Param('tripId') tripId: string,
    @Body(hotelChangePipe) body: HotelChangeRequest,
  ) {
    return this.trips.confirmHotelCheckInChange({
      tripId,
      newCheckInDate: body.newCheckInDate,
      sessionId: body.sessionId,
    })
  }
}
