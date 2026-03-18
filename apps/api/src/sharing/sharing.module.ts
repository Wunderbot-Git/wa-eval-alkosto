import { Module } from '@nestjs/common'
import { SharingService } from './sharing.service'
import { SharingController } from './sharing.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [SharingController],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}
