import { Injectable, Inject } from '@nestjs/common'
import type {
  QualityJudge,
  QualityJudgeResult,
  MessageLike,
} from '../judges/judge.interfaces'
import { QUALITY_JUDGE } from '../judges/judge.tokens'

@Injectable()
export class QualityEvaluationService {
  constructor(
    @Inject(QUALITY_JUDGE) private readonly judge: QualityJudge,
  ) {}

  async evaluate(transcript: MessageLike[]): Promise<QualityJudgeResult> {
    return this.judge.evaluate(transcript)
  }
}
