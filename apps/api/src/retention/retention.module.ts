import { Module } from '@nestjs/common'
import { RetentionService } from './retention.service'
import { RetentionController } from './retention.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [RetentionController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
