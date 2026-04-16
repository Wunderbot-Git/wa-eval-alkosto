import { Injectable } from '@nestjs/common'
import type {
  RecommendationJudge,
  RecommendationJudgeResult,
  MessageLike,
  ExtractedNeeds,
  ProductSpecSheet,
  CatalogProductLike,
} from '../judge.interfaces'
import { GeminiClientService } from './gemini-client.service'
import { PromptLoaderService } from '../prompt-loader.service'

@Injectable()
export class GeminiRecommendationJudge implements RecommendationJudge {
  constructor(
    private readonly gemini: GeminiClientService,
    private readonly promptLoader: PromptLoaderService,
  ) {}

  async evaluate(
    transcript: MessageLike[],
    statedNeeds: ExtractedNeeds,
    mentionedSpecs: ProductSpecSheet[],
    candidateAlternatives: CatalogProductLike[],
  ): Promise<RecommendationJudgeResult> {
    const systemPrompt = this.promptLoader.getPrompt('recommendation', 'system.md')
    const userPrompt = this.promptLoader.getPrompt('recommendation', 'user.md', {
      TRANSCRIPT: JSON.stringify(transcript),
      STATED_NEEDS: JSON.stringify(statedNeeds),
      MENTIONED_SPECS: JSON.stringify(mentionedSpecs),
      CANDIDATE_ALTERNATIVES: JSON.stringify(candidateAlternatives),
    })

    const result = await this.gemini.generateJSON<RecommendationJudgeResult>(
      systemPrompt.content,
      userPrompt.content,
    )

    return {
      findings: Array.isArray(result.findings)
        ? result.findings.map((f) => ({
            type: String(f.type || 'unknown'),
            severity: f.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
            description: String(f.description || ''),
            evidence: f.evidence ? String(f.evidence) : undefined,
          }))
        : [],
      summary: result.summary ? String(result.summary) : undefined,
    }
  }
}
