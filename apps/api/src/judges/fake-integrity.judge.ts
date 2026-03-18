import { Injectable } from '@nestjs/common'
import type {
  IntegrityJudge,
  IntegrityJudgeResult,
  MessageLike,
  CatalogProductLike,
} from './judge.interfaces'

@Injectable()
export class FakeIntegrityJudge implements IntegrityJudge {
  async evaluate(
    _transcript: MessageLike[],
    _catalog: CatalogProductLike[],
  ): Promise<IntegrityJudgeResult> {
    return {
      findings: [
        {
          type: 'price_mismatch',
          severity: 'WARNING',
          description: 'Fake finding: potential price mismatch detected',
          evidence: 'Agent quoted a different price than catalog',
        },
      ],
    }
  }
}
