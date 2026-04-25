import { Body, Controller, Post } from '@nestjs/common'
import { ZodValidationPipe } from '../zod.pipe.js'
import {
  type CreateSupportLogRequest,
  createSupportLogSchema,
} from './support-logs.dto.js'
import { SupportLogsService } from './support-logs.service.js'

const createLogPipe = new ZodValidationPipe(createSupportLogSchema)

@Controller('support-logs')
export class SupportLogsController {
  constructor(private readonly logs: SupportLogsService) {}

  @Post()
  create(@Body(createLogPipe) body: CreateSupportLogRequest) {
    return this.logs.create(body)
  }
}
