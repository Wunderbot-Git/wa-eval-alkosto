import { Injectable } from '@nestjs/common'
import type {
  ExtractionJudge,
  ExtractionResult,
  MessageLike,
  CatalogProductLike,
} from '../judge.interfaces'
import { GeminiClientService } from './gemini-client.service'
import { PromptLoaderService } from '../prompt-loader.service'

@Injectable()
export class GeminiExtractionJudge implements ExtractionJudge {
  constructor(
    private readonly gemini: GeminiClientService,
    private readonly promptLoader: PromptLoaderService,
  ) {}

  async evaluate(
    transcript: MessageLike[],
    catalog: CatalogProductLike[],
  ): Promise<ExtractionResult> {
    const systemPrompt = this.promptLoader.getPrompt('extraction', 'system.md')
    const userPrompt = this.promptLoader.getPrompt('extraction', 'user.md', {
      TRANSCRIPT: JSON.stringify(transcript),
      CATALOG: JSON.stringify(catalog),
    })

    const result = await this.gemini.generateJSON<ExtractionResult>(
      systemPrompt.content,
      userPrompt.content,
    )

    const knownIds = new Set(catalog.map((p) => p.externalId))
    const mentioned = Array.isArray(result.mentionedExternalIds)
      ? result.mentionedExternalIds
          .map((id) => String(id))
          .filter((id) => knownIds.has(id))
      : []

    const rawNeeds: any = result.statedNeeds ?? {}
    return {
      mentionedExternalIds: Array.from(new Set(mentioned)),
      statedNeeds: {
        use_case: rawNeeds.use_case ? String(rawNeeds.use_case) : null,
        budget_min: typeof rawNeeds.budget_min === 'number' ? rawNeeds.budget_min : null,
        budget_max: typeof rawNeeds.budget_max === 'number' ? rawNeeds.budget_max : null,
        must_have_specs: Array.isArray(rawNeeds.must_have_specs)
          ? rawNeeds.must_have_specs.map((s: any) => String(s))
          : [],
        deal_breakers: Array.isArray(rawNeeds.deal_breakers)
          ? rawNeeds.deal_breakers.map((s: any) => String(s))
          : [],
      },
    }
  }
}
