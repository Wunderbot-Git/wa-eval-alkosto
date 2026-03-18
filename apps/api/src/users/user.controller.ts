import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common'
import { UserService } from './user.service'
import { AuthGuard } from '../auth/auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { Role } from '@eval/shared'

@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async listUsers() {
    return this.userService.listUsers()
  }

  @Patch(':id/deactivate')
  @HttpCode(200)
  async deactivateUser(@Param('id') id: string) {
    return this.userService.deactivateUser(id)
  }

  @Patch(':id/role')
  @HttpCode(200)
  async changeRole(
    @Param('id') id: string,
    @Body() body: { role: Role },
  ) {
    return this.userService.changeRole(id, body.role)
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  async resetPassword(@Param('id') id: string) {
    return this.userService.resetPassword(id)
  }
}
