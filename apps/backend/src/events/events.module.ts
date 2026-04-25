import { Global, Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { EventsController } from './events.controller.js'
import { VoiceEventsBus } from './voice-events.bus.js'

/**
 * Global so any feature module can inject `VoiceEventsBus` without
 * importing this module explicitly. The bus is a singleton; the
 * controller exposes the SSE stream + polling endpoints.
 */
@Global()
@Module({
  controllers: [EventsController],
  providers: [VoiceEventsBus, PrismaService],
  exports: [VoiceEventsBus],
})
export class EventsModule {}
