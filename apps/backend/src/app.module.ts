import { Module } from '@nestjs/common'
import { CatalogModule } from './catalog/catalog.module.js'
import { HealthController } from './health.controller.js'
import { SupportLogsModule } from './support-logs/support-logs.module.js'
import { TripsModule } from './trips/trips.module.js'
import { VoiceModule } from './voice/voice.module.js'

@Module({
  imports: [TripsModule, CatalogModule, SupportLogsModule, VoiceModule],
  controllers: [HealthController],
})
export class AppModule {}
