import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common'
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

  @Get(':id')
  async one(@Param('id') id: string) {
    const session = await this.sessions.getById(id)
    if (!session) throw new NotFoundException(`VoiceSession ${id} not found`)
    return session
  }
}
