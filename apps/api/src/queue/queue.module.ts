import { Global, Module } from '@nestjs/common'
import { EvaluationQueueService } from './evaluation-queue.service'

@Global()
@Module({
  providers: [EvaluationQueueService],
  exports: [EvaluationQueueService],
})
export class QueueModule {}
