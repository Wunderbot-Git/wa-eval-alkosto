import { Module } from '@nestjs/common'
import { InvitationService } from './invitation.service'
import { InvitationController } from './invitation.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [InvitationController],
  providers: [InvitationService],
  exports: [InvitationService],
})
export class InvitationModule {}
