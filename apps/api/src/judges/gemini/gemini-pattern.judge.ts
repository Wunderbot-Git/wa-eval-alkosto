import { Injectable } from '@nestjs/common'
import type {
  PatternJudge,
  PatternJudgeResult,
  MessageLike,
} from '../judge.interfaces'
import { GeminiClientService } from './gemini-client.service'
import { PromptLoaderService } from '../prompt-loader.service'

@Injectable()
export class GeminiPatternJudge implements PatternJudge {
  constructor(
    private readonly gemini: GeminiClientService,
    private readonly promptLoader: PromptLoaderService,
  ) {}

  async evaluate(transcript: MessageLike[]): Promise<PatternJudgeResult> {
    const systemPrompt = this.promptLoader.getPrompt('patterns', 'system.md')
    const userPrompt = this.promptLoader.getPrompt('patterns', 'user.md', {
      TRANSCRIPT: JSON.stringify(transcript),
    })

    const result = await this.gemini.generateJSON<PatternJudgeResult>(
      systemPrompt.content,
      userPrompt.content,
    )

    return {
      classifications: Array.isArray(result.classifications)
        ? result.classifications.map((c) => ({
            name: String(c.name || 'unknown'),
            isEmergent: Boolean(c.isEmergent),
            explanation: c.explanation ? String(c.explanation) : undefined,
            evidence: c.evidence ? String(c.evidence) : undefined,
          }))
        : [],
    }
  }
}
