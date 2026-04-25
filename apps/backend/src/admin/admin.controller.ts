import { Controller, HttpCode, Post } from '@nestjs/common'
import { AdminService } from './admin.service.js'

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /**
   * Resets the demo trip back to a fresh 4-night stay. Idempotent —
   * safe to call repeatedly (the seed pipeline wipes + recreates).
   */
  @Post('reset-demo')
  @HttpCode(200)
  async resetDemo() {
    await this.admin.resetDemoTrip()
    return { ok: true }
  }
}
