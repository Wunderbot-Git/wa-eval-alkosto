import { Module } from '@nestjs/common'
import { RunService } from './run.service'
import { RunController } from './run.controller'
import { AuthModule } from '../auth/auth.module'
import { ConversationsModule } from '../conversations/conversations.module'
import { PipelineModule } from '../pipeline/pipeline.module'
import { SharingModule } from '../sharing/sharing.module'
import { QueueModule } from '../queue/queue.module'

@Module({
  imports: [AuthModule, ConversationsModule, PipelineModule, SharingModule, QueueModule],
  controllers: [RunController],
  providers: [RunService],
  exports: [RunService],
})
export class RunModule {}
