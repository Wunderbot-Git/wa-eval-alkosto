import { Injectable } from '@nestjs/common'
import type {
  QualityJudge,
  QualityJudgeResult,
  MessageLike,
} from '../judge.interfaces'
import { GeminiClientService } from './gemini-client.service'
import { PromptLoaderService } from '../prompt-loader.service'

@Injectable()
export class GeminiQualityJudge implements QualityJudge {
  constructor(
    private readonly gemini: GeminiClientService,
    private readonly promptLoader: PromptLoaderService,
  ) {}

  async evaluate(transcript: MessageLike[]): Promise<QualityJudgeResult> {
    const systemPrompt = this.promptLoader.getPrompt('quality', 'system.md')
    const userPrompt = this.promptLoader.getPrompt('quality', 'user.md', {
      TRANSCRIPT: JSON.stringify(transcript),
    })

    const result = await this.gemini.generateJSON<QualityJudgeResult>(
      systemPrompt.content,
      userPrompt.content,
    )

    // Normalize the result
    const score = Math.max(0, Math.min(10, Number(result.score) || 0))
    return {
      score,
      subScores: {
        understanding: Math.max(0, Math.min(10, Number(result.subScores?.understanding) || 0)),
        recommendation: Math.max(0, Math.min(10, Number(result.subScores?.recommendation) || 0)),
        fluency: Math.max(0, Math.min(10, Number(result.subScores?.fluency) || 0)),
      },
      findings: Array.isArray(result.findings)
        ? result.findings.map((f) => ({
            description: String(f.description || ''),
            messageRef: f.messageRef != null ? Number(f.messageRef) : undefined,
          }))
        : [],
    }
  }
}
