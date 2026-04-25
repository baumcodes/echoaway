import { Body, Controller, Get, Param, Post } from '@nestjs/common'
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
  byPhone(@Param('phoneNumber') phoneNumber: string) {
    return this.trips.getTripByPhone(phoneNumber)
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
