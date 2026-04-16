import { Injectable, Inject } from '@nestjs/common'
import type {
  ExtractionJudge,
  ExtractionResult,
  MessageLike,
  CatalogProductLike,
} from '../judges/judge.interfaces'
import { EXTRACTION_JUDGE } from '../judges/judge.tokens'

@Injectable()
export class ExtractionService {
  constructor(
    @Inject(EXTRACTION_JUDGE) private readonly judge: ExtractionJudge,
  ) {}

  async extract(
    transcript: MessageLike[],
    catalog: CatalogProductLike[],
  ): Promise<ExtractionResult> {
    return this.judge.evaluate(transcript, catalog)
  }
}
