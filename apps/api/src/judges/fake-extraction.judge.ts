import { Injectable } from '@nestjs/common'
import type {
  ExtractionJudge,
  ExtractionResult,
  MessageLike,
  CatalogProductLike,
} from './judge.interfaces'

/**
 * Deterministic fake used when GEMINI_API_KEY is unset.
 * Picks up to 3 catalog ids whose title shares a 6+ char substring with any
 * agent message. Returns no statedNeeds — tests that need them mock the judge.
 */
@Injectable()
export class FakeExtractionJudge implements ExtractionJudge {
  async evaluate(
    transcript: MessageLike[],
    catalog: CatalogProductLike[],
  ): Promise<ExtractionResult> {
    const agentText = transcript
      .filter((m) => m.role.toLowerCase() === 'agent')
      .map((m) => m.content.toLowerCase())
      .join(' ')

    const matched: string[] = []
    for (const product of catalog) {
      if (matched.length >= 3) break
      const title = (product.title || '').toLowerCase()
      const tokens = title.split(/\s+/).filter((t) => t.length >= 6)
      if (tokens.some((t) => agentText.includes(t))) {
        matched.push(product.externalId)
      }
    }

    return {
      mentionedExternalIds: matched,
      statedNeeds: {
        use_case: null,
        budget_min: null,
        budget_max: null,
        must_have_specs: [],
        deal_breakers: [],
      },
    }
  }
}
