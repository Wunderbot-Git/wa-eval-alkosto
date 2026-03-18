import { Injectable, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
  PatternJudge,
  PatternJudgeResult,
  MessageLike,
} from '../judges/judge.interfaces'
import { PATTERN_JUDGE } from '../judges/judge.tokens'

@Injectable()
export class PatternEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PATTERN_JUDGE) private readonly judge: PatternJudge,
  ) {}

  async evaluate(
    evaluationId: string,
    transcript: MessageLike[],
  ): Promise<PatternJudgeResult> {
    const result = await this.judge.evaluate(transcript)

    // Persist patterns to the Pattern model
    if (result.classifications.length > 0) {
      await this.prisma.pattern.createMany({
        data: result.classifications.map((c) => ({
          evaluationId,
          name: c.name,
          isEmergent: c.isEmergent,
          explanation: c.explanation || null,
          evidence: c.evidence || null,
        })),
      })
    }

    return result
  }
}
