import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import { ReevaluationService, ReevaluationFilters } from './reevaluation.service'
import { AuthGuard } from '../auth/auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'

@Controller('runs')
export class ReevaluationController {
  constructor(private readonly reevaluationService: ReevaluationService) {}

  @Post(':id/reevaluate')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'INTERNAL_ALKOSTO')
  async reevaluateRun(
    @Param('id') id: string,
    @Body() body: { filters?: ReevaluationFilters },
    @Req() req: Request,
  ) {
    const user = (req as any).user
    return this.reevaluationService.reevaluateRun(id, user.id, body.filters)
  }
}
