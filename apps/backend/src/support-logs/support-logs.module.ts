import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { SupportLogsController } from './support-logs.controller.js'
import { SupportLogsService } from './support-logs.service.js'

@Module({
  controllers: [SupportLogsController],
  providers: [SupportLogsService, PrismaService],
})
export class SupportLogsModule {}
