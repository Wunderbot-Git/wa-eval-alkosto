import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common'
import { RetentionService } from './retention.service'
import { AuthGuard } from '../auth/auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'

@Controller('retention')
export class RetentionController {
  constructor(private readonly retentionService: RetentionService) {}

  @Get('stats')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getStats() {
    return this.retentionService.getStats()
  }
}
