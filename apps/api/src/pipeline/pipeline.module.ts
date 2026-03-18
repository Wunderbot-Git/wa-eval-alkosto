import { Module } from '@nestjs/common'
import { PipelineService } from './pipeline.service'
import { EvaluationWorker } from './evaluation.worker'
import { CatalogModule } from '../catalog/catalog.module'
import { JudgesModule } from '../judges/judges.module'
import { EvaluationModule } from '../evaluation/evaluation.module'
import { RetentionModule } from '../retention/retention.module'

@Module({
  imports: [CatalogModule, JudgesModule, EvaluationModule, RetentionModule],
  providers: [PipelineService, EvaluationWorker],
  exports: [PipelineService],
})
export class PipelineModule {}
