import { Injectable } from '@nestjs/common'
import type {
  ConsolidatorJudge,
  ConsolidatorResult,
  IntegrityJudgeResult,
  QualityJudgeResult,
  PatternJudgeResult,
} from './judge.interfaces'

@Injectable()
export class FakeConsolidatorJudge implements ConsolidatorJudge {
  async consolidate(
    _integrity: IntegrityJudgeResult | null,
    quality: QualityJudgeResult | null,
    _patterns: PatternJudgeResult | null,
  ): Promise<ConsolidatorResult> {
    const score = quality?.score ?? 5.0
    let label: 'aprobada' | 'con_hallazgos' | 'fallida'

    if (score >= 8.5) {
      label = 'aprobada'
    } else if (score >= 6.0) {
      label = 'con_hallazgos'
    } else {
      label = 'fallida'
    }

    return {
      score,
      label,
      explanation: `Fake consolidation: score ${score} → ${label}`,
    }
  }
}
