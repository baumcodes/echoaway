import { Body, Controller, Post } from '@nestjs/common'
import { ZodValidationPipe } from '../zod.pipe.js'
import {
  type CreateVoiceSessionRequest,
  createVoiceSessionSchema,
} from './voice-sessions.dto.js'
import { VoiceSessionsService } from './voice-sessions.service.js'

const createPipe = new ZodValidationPipe(createVoiceSessionSchema)

@Controller('voice-sessions')
export class VoiceSessionsController {
  constructor(private readonly sessions: VoiceSessionsService) {}

  @Post()
  create(@Body(createPipe) body: CreateVoiceSessionRequest) {
    return this.sessions.create(body)
  }
}
