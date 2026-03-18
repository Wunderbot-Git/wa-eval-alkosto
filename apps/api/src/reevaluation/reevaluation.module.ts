import { Module } from '@nestjs/common'
import { ReevaluationService } from './reevaluation.service'
import { ReevaluationController } from './reevaluation.controller'
import { AuthModule } from '../auth/auth.module'
import { PipelineModule } from '../pipeline/pipeline.module'

@Module({
  imports: [AuthModule, PipelineModule],
  controllers: [ReevaluationController],
  providers: [ReevaluationService],
  exports: [ReevaluationService],
})
export class ReevaluationModule {}
