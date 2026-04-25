import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { TripsController } from './trips.controller.js'
import { TripsService } from './trips.service.js'

@Module({
  controllers: [TripsController],
  providers: [TripsService, PrismaService],
  exports: [TripsService],
})
export class TripsModule {}
