import { Injectable, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
  RecommendationJudge,
  RecommendationJudgeResult,
  MessageLike,
  ExtractedNeeds,
  ProductSpecSheet,
  CatalogProductLike,
} from '../judges/judge.interfaces'
import { RECOMMENDATION_JUDGE } from '../judges/judge.tokens'

@Injectable()
export class RecommendationEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RECOMMENDATION_JUDGE) private readonly judge: RecommendationJudge,
  ) {}

  async evaluate(
    evaluationId: string,
    transcript: MessageLike[],
    statedNeeds: ExtractedNeeds,
    mentionedSpecs: ProductSpecSheet[],
    candidateAlternatives: CatalogProductLike[],
  ): Promise<RecommendationJudgeResult> {
    const result = await this.judge.evaluate(
      transcript,
      statedNeeds,
      mentionedSpecs,
      candidateAlternatives,
    )

    if (result.findings.length > 0) {
      await this.prisma.finding.createMany({
        data: result.findings.map((f) => ({
          evaluationId,
          module: 'recommendation',
          type: f.type,
          severity: f.severity as any,
          description: f.description,
          evidence: f.evidence || null,
        })),
      })
    }

    return result
  }
}
