import { Injectable, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
  IntegrityJudge,
  IntegrityJudgeResult,
  MessageLike,
  CatalogProductLike,
} from '../judges/judge.interfaces'
import { INTEGRITY_JUDGE } from '../judges/judge.tokens'

@Injectable()
export class IntegrityEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INTEGRITY_JUDGE) private readonly judge: IntegrityJudge,
  ) {}

  async evaluate(
    evaluationId: string,
    transcript: MessageLike[],
    catalog: CatalogProductLike[],
  ): Promise<IntegrityJudgeResult> {
    const result = await this.judge.evaluate(transcript, catalog)

    // Persist findings to the Finding model
    if (result.findings.length > 0) {
      await this.prisma.finding.createMany({
        data: result.findings.map((f) => ({
          evaluationId,
          type: f.type,
          severity: f.severity as any,
          description: f.description,
          evidence: f.evidence || null,
        })),
      })
    }

    return result
  }
}
