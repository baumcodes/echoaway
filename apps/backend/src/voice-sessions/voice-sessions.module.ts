import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { VoiceSessionsController } from './voice-sessions.controller.js'
import { VoiceSessionsService } from './voice-sessions.service.js'

@Module({
  controllers: [VoiceSessionsController],
  providers: [VoiceSessionsService, PrismaService],
})
export class VoiceSessionsModule {}
