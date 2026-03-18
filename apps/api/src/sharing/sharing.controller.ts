import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import { SharingService } from './sharing.service'
import { AuthGuard } from '../auth/auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'

@Controller('sharing')
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @Post('runs/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'INTERNAL_ALKOSTO')
  async shareRun(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user
    return this.sharingService.shareRun(id, user.id)
  }

  @Post('conversations/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'INTERNAL_ALKOSTO')
  async shareConversation(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user
    return this.sharingService.shareConversation(id, user.id)
  }

  @Get('runs')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('YALO_READER', 'ADMIN', 'INTERNAL_ALKOSTO')
  async getSharedRuns(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.sharingService.getSharedRuns(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    )
  }

  @Get('runs/:id/conversations')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('YALO_READER', 'ADMIN', 'INTERNAL_ALKOSTO')
  async getSharedConversations(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.sharingService.getSharedConversations(
      id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    )
  }

  @Get('runs/:id/status')
  @UseGuards(AuthGuard)
  async isShared(@Param('id') id: string) {
    const shared = await this.sharingService.isShared(id)
    return { shared }
  }
}
