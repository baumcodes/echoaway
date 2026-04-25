import { Body, Controller, Post } from '@nestjs/common'
import { ZodValidationPipe } from '../zod.pipe.js'
import { type VoiceTokenRequest, voiceTokenRequestSchema } from './voice.dto.js'
import { VoiceService } from './voice.service.js'

const tokenPipe = new ZodValidationPipe(voiceTokenRequestSchema)

@Controller('voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post('token')
  token(@Body(tokenPipe) body: VoiceTokenRequest) {
    return this.voice.mintToken(body)
  }
}
