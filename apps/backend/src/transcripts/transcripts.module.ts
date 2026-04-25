import { Global, Module } from '@nestjs/common'
import { TranscriptsController } from './transcripts.controller.js'
import { TranscriptsBus } from './transcripts.bus.js'

@Global()
@Module({
  controllers: [TranscriptsController],
  providers: [TranscriptsBus],
  exports: [TranscriptsBus],
})
export class TranscriptsModule {}
