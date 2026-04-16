import { Injectable, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PromptLoaderService } from '../judges/prompt-loader.service'
import type {
  ConsolidatorJudge,
  ConsolidatorResult,
  IntegrityJudgeResult,
  QualityJudgeResult,
  PatternJudgeResult,
  RecommendationJudgeResult,
  ExtractedNeeds,
} from '../judges/judge.interfaces'
import { CONSOLIDATOR_JUDGE } from '../judges/judge.tokens'

export interface ConsolidationInput {
  conversationId: string
  evaluationId: string
  integrity: IntegrityJudgeResult
  quality: QualityJudgeResult
  patterns: PatternJudgeResult
  recommendation?: RecommendationJudgeResult | null
  statedNeeds?: ExtractedNeeds | null
}

const LABEL_MAP: Record<string, string> = {
  aprobada: 'APROBADA',
  con_hallazgos: 'CON_HALLAZGOS',
  fallida: 'FALLIDA',
}

@Injectable()
export class ConsolidatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promptLoader: PromptLoaderService,
    @Inject(CONSOLIDATOR_JUDGE) private readonly judge: ConsolidatorJudge,
  ) {}

  async consolidate(input: ConsolidationInput): Promise<ConsolidatorResult> {
    const {
      conversationId,
      evaluationId,
      integrity,
      quality,
      patterns,
      recommendation = null,
      statedNeeds = null,
    } = input

    const result = await this.judge.consolidate(integrity, quality, patterns, recommendation)

    const promptVersions = this.getPromptVersions()

    await this.prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        score: result.score,
        label: LABEL_MAP[result.label] as any,
        integrityFindings: integrity.findings as any,
        qualitySubScores: quality.subScores as any,
        patternClassifications: patterns.classifications as any,
        recommendationFindings: (recommendation?.findings ?? null) as any,
        recommendationSummary: recommendation?.summary ?? null,
        extractedNeeds: (statedNeeds ?? null) as any,
        consolidatorExplanation: result.explanation,
        promptVersions: promptVersions as any,
      },
    })

    await this.prisma.snapshot.create({
      data: {
        conversationId,
        data: {
          integrity,
          quality,
          patterns,
          recommendation,
          extractedNeeds: statedNeeds,
          consolidator: result,
          promptVersions,
        } as any,
      },
    })

    return result
  }

  private getPromptVersions(): Record<string, string> {
    const judges = [
      'integrity',
      'quality',
      'patterns',
      'consolidator',
      'extraction',
      'recommendation',
    ]
    const files = ['system.md', 'user.md']
    const versions: Record<string, string> = {}

    for (const judge of judges) {
      for (const file of files) {
        try {
          versions[`${judge}/${file}`] = this.promptLoader.getVersion(judge, file)
        } catch {
          // Prompt file may not be loaded in test environments
        }
      }
    }

    return versions
  }
}
