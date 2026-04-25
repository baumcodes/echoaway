import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { TripCandidatesController } from './trip-candidates.controller.js'
import { TripCandidatesService } from './trip-candidates.service.js'
import { TripsController } from './trips.controller.js'
import { TripsService } from './trips.service.js'

@Module({
  controllers: [TripsController, TripCandidatesController],
  providers: [TripsService, TripCandidatesService, PrismaService],
  exports: [TripsService, TripCandidatesService],
})
export class TripsModule {}
