import { Injectable } from '@nestjs/common'
import type {
  IntegrityJudge,
  IntegrityJudgeResult,
  MessageLike,
  CatalogProductLike,
} from '../judge.interfaces'
import { GeminiClientService } from './gemini-client.service'
import { PromptLoaderService } from '../prompt-loader.service'

@Injectable()
export class GeminiIntegrityJudge implements IntegrityJudge {
  constructor(
    private readonly gemini: GeminiClientService,
    private readonly promptLoader: PromptLoaderService,
  ) {}

  async evaluate(
    transcript: MessageLike[],
    catalog: CatalogProductLike[],
  ): Promise<IntegrityJudgeResult> {
    const systemPrompt = this.promptLoader.getPrompt('integrity', 'system.md')
    const userPrompt = this.promptLoader.getPrompt('integrity', 'user.md', {
      TRANSCRIPT: JSON.stringify(transcript),
      CATALOG: JSON.stringify(catalog),
    })

    const result = await this.gemini.generateJSON<IntegrityJudgeResult>(
      systemPrompt.content,
      userPrompt.content,
    )

    // Ensure the result conforms to the expected shape
    return {
      findings: Array.isArray(result.findings)
        ? result.findings.map((f) => ({
            type: String(f.type || 'unknown'),
            severity: f.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
            description: String(f.description || ''),
            evidence: f.evidence ? String(f.evidence) : undefined,
          }))
        : [],
    }
  }
}
