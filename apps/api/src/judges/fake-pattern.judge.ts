import { Injectable } from '@nestjs/common'
import type { PatternJudge, PatternJudgeResult, MessageLike } from './judge.interfaces'

@Injectable()
export class FakePatternJudge implements PatternJudge {
  async evaluate(_transcript: MessageLike[]): Promise<PatternJudgeResult> {
    return {
      classifications: [
        {
          name: 'consulta_producto',
          isEmergent: false,
          explanation: 'Fake classification: customer inquired about a product',
          evidence: 'Customer asked about product details',
        },
      ],
    }
  }
}
