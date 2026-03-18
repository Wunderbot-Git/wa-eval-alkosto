import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { RolesGuard } from './roles.guard'
import { SessionCleanupService } from './session-cleanup.service'

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RolesGuard, SessionCleanupService],
  exports: [AuthService, AuthGuard, RolesGuard],
})
export class AuthModule {}
