import { Module } from '@nestjs/common'
import { AdminModule } from './admin/admin.module.js'
import { CatalogModule } from './catalog/catalog.module.js'
import { EventsModule } from './events/events.module.js'
import { HealthController } from './health.controller.js'
import { SupportLogsModule } from './support-logs/support-logs.module.js'
import { TripsModule } from './trips/trips.module.js'
import { VoiceModule } from './voice/voice.module.js'
import { VoiceSessionsModule } from './voice-sessions/voice-sessions.module.js'

@Module({
  imports: [
    AdminModule,
    EventsModule,
    TripsModule,
    CatalogModule,
    SupportLogsModule,
    VoiceModule,
    VoiceSessionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
