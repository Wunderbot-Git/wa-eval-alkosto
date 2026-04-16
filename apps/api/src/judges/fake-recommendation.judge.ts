import { Injectable } from '@nestjs/common'
import type {
  RecommendationJudge,
  RecommendationJudgeResult,
  MessageLike,
  ExtractedNeeds,
  ProductSpecSheet,
  CatalogProductLike,
} from './judge.interfaces'

@Injectable()
export class FakeRecommendationJudge implements RecommendationJudge {
  async evaluate(
    _transcript: MessageLike[],
    _statedNeeds: ExtractedNeeds,
    mentionedSpecs: ProductSpecSheet[],
    _candidates: CatalogProductLike[],
  ): Promise<RecommendationJudgeResult> {
    if (mentionedSpecs.length === 0) {
      return {
        findings: [],
        summary: 'Fake: no se discutió ningún producto recomendable.',
      }
    }
    return {
      findings: [
        {
          type: 'over_spec_for_need',
          severity: 'WARNING',
          description: 'Fake finding: el equipo recomendado podría exceder lo necesario.',
          evidence: 'Recomendación detectada en la conversación.',
        },
      ],
      summary: 'Fake: la recomendación es plausible pero podría afinarse.',
    }
  }
}
