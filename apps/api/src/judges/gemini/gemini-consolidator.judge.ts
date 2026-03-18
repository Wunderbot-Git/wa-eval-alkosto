import { Injectable } from '@nestjs/common'
import type {
  ConsolidatorJudge,
  ConsolidatorResult,
  IntegrityJudgeResult,
  QualityJudgeResult,
  PatternJudgeResult,
} from '../judge.interfaces'
import { GeminiClientService } from './gemini-client.service'
import { PromptLoaderService } from '../prompt-loader.service'

@Injectable()
export class GeminiConsolidatorJudge implements ConsolidatorJudge {
  constructor(
    private readonly gemini: GeminiClientService,
    private readonly promptLoader: PromptLoaderService,
  ) {}

  async consolidate(
    integrity: IntegrityJudgeResult | null,
    quality: QualityJudgeResult | null,
    patterns: PatternJudgeResult | null,
  ): Promise<ConsolidatorResult> {
    const systemPrompt = this.promptLoader.getPrompt('consolidator', 'system.md')
    const userPrompt = this.promptLoader.getPrompt('consolidator', 'user.md', {
      INTEGRITY: JSON.stringify(integrity),
      QUALITY: JSON.stringify(quality),
      PATTERNS: JSON.stringify(patterns),
    })

    const result = await this.gemini.generateJSON<ConsolidatorResult>(
      systemPrompt.content,
      userPrompt.content,
    )

    const score = Math.max(0, Math.min(10, Number(result.score) || 0))
    const validLabels = ['aprobada', 'con_hallazgos', 'fallida'] as const
    const label = validLabels.includes(result.label as any)
      ? (result.label as 'aprobada' | 'con_hallazgos' | 'fallida')
      : 'fallida'

    return {
      score,
      label,
      explanation: String(result.explanation || ''),
    }
  }
}
