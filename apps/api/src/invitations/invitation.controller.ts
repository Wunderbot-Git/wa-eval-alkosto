import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common'
import type { Request } from 'express'
import { InvitationService } from './invitation.service'
import { AuthGuard } from '../auth/auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { Role } from '@eval/shared'
import { CreateInvitationDto } from './dto/create-invitation.dto'
import { ActivateInvitationDto } from './dto/activate-invitation.dto'

@Controller('invitations')
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(201)
  async createInvite(
    @Body() body: CreateInvitationDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user
    return this.invitationService.createInvite(body.email, body.role, user.id)
  }

  @Get('accept/:token')
  async acceptInvite(@Param('token') token: string) {
    return this.invitationService.getInviteByToken(token)
  }

  @Post('activate')
  @HttpCode(200)
  async activateInvite(@Body() body: ActivateInvitationDto) {
    return this.invitationService.activateInvite(body.token, body.password)
  }
}
