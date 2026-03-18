import { Module } from '@nestjs/common'
import { JudgesModule } from '../judges/judges.module'
import { IntegrityEvaluationService } from './integrity-evaluation.service'
import { QualityEvaluationService } from './quality-evaluation.service'
import { PatternEvaluationService } from './pattern-evaluation.service'
import { ConsolidatorService } from './consolidator.service'

@Module({
  imports: [JudgesModule],
  providers: [
    IntegrityEvaluationService,
    QualityEvaluationService,
    PatternEvaluationService,
    ConsolidatorService,
  ],
  exports: [
    IntegrityEvaluationService,
    QualityEvaluationService,
    PatternEvaluationService,
    ConsolidatorService,
  ],
})
export class EvaluationModule {}
