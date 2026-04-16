import { Injectable } from '@nestjs/common'
import type {
  ConsolidatorJudge,
  ConsolidatorResult,
  IntegrityJudgeResult,
  QualityJudgeResult,
  PatternJudgeResult,
  RecommendationJudgeResult,
} from './judge.interfaces'

@Injectable()
export class FakeConsolidatorJudge implements ConsolidatorJudge {
  async consolidate(
    integrity: IntegrityJudgeResult | null,
    quality: QualityJudgeResult | null,
    _patterns: PatternJudgeResult | null,
    recommendation: RecommendationJudgeResult | null = null,
  ): Promise<ConsolidatorResult> {
    let score = quality?.score ?? 5.0

    const recCritical = (recommendation?.findings ?? []).filter((f) => f.severity === 'CRITICAL').length
    const recWarnings = (recommendation?.findings ?? []).filter((f) => f.severity === 'WARNING').length
    score -= recCritical * 1.5 + recWarnings * 0.4
    score = Math.max(0, Math.min(10, score))

    let label: 'aprobada' | 'con_hallazgos' | 'fallida'
    const integrityCritical = (integrity?.findings ?? []).some((f) => f.severity === 'CRITICAL')

    if (integrityCritical || recCritical > 0 || score < 6.0) {
      label = 'fallida'
    } else if (score >= 8.5) {
      label = 'aprobada'
    } else {
      label = 'con_hallazgos'
    }

    return {
      score,
      label,
      explanation: `Fake consolidation: score ${score.toFixed(2)} → ${label}`,
    }
  }
}
