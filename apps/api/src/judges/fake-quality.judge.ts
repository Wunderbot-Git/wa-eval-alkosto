import { Injectable } from '@nestjs/common'
import type { QualityJudge, QualityJudgeResult, MessageLike } from './judge.interfaces'

@Injectable()
export class FakeQualityJudge implements QualityJudge {
  async evaluate(_transcript: MessageLike[]): Promise<QualityJudgeResult> {
    return {
      score: 7.5,
      subScores: {
        understanding: 7.0,
        recommendation: 8.0,
        fluency: 7.5,
      },
      findings: [
        {
          description: 'Fake finding: generally good response quality',
          messageRef: 1,
        },
      ],
    }
  }
}
