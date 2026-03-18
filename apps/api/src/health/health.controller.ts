import { Controller, Get } from '@nestjs/common'
import type { HealthResponse } from '@eval/shared'

@Controller()
export class HealthController {
  @Get('health')
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }
}
