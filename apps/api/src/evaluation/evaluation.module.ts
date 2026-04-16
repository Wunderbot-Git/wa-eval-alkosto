import { Module } from '@nestjs/common'
import { JudgesModule } from '../judges/judges.module'
import { IntegrityEvaluationService } from './integrity-evaluation.service'
import { QualityEvaluationService } from './quality-evaluation.service'
import { PatternEvaluationService } from './pattern-evaluation.service'
import { ConsolidatorService } from './consolidator.service'
import { ExtractionService } from './extraction.service'
import { RecommendationEvaluationService } from './recommendation-evaluation.service'

@Module({
  imports: [JudgesModule],
  providers: [
    IntegrityEvaluationService,
    QualityEvaluationService,
    PatternEvaluationService,
    ConsolidatorService,
    ExtractionService,
    RecommendationEvaluationService,
  ],
  exports: [
    IntegrityEvaluationService,
    QualityEvaluationService,
    PatternEvaluationService,
    ConsolidatorService,
    ExtractionService,
    RecommendationEvaluationService,
  ],
})
export class EvaluationModule {}
