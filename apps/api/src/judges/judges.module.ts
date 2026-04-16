import { Module, Logger } from '@nestjs/common'
import { FakeIntegrityJudge } from './fake-integrity.judge'
import { FakeQualityJudge } from './fake-quality.judge'
import { FakePatternJudge } from './fake-pattern.judge'
import { FakeConsolidatorJudge } from './fake-consolidator.judge'
import { FakeExtractionJudge } from './fake-extraction.judge'
import { FakeRecommendationJudge } from './fake-recommendation.judge'
import { GeminiClientService } from './gemini/gemini-client.service'
import { GeminiIntegrityJudge } from './gemini/gemini-integrity.judge'
import { GeminiQualityJudge } from './gemini/gemini-quality.judge'
import { GeminiPatternJudge } from './gemini/gemini-pattern.judge'
import { GeminiConsolidatorJudge } from './gemini/gemini-consolidator.judge'
import { GeminiExtractionJudge } from './gemini/gemini-extraction.judge'
import { GeminiRecommendationJudge } from './gemini/gemini-recommendation.judge'
import { PromptLoaderService } from './prompt-loader.service'
import {
  INTEGRITY_JUDGE,
  QUALITY_JUDGE,
  PATTERN_JUDGE,
  CONSOLIDATOR_JUDGE,
  EXTRACTION_JUDGE,
  RECOMMENDATION_JUDGE,
} from './judge.tokens'

const useGemini = !!process.env.GEMINI_API_KEY

const logger = new Logger('JudgesModule')

if (useGemini) {
  logger.log('Using Gemini judges (GEMINI_API_KEY is set)')
} else {
  logger.log('Using fake judges (GEMINI_API_KEY not set)')
}

const geminiProviders = [
  GeminiClientService,
  { provide: INTEGRITY_JUDGE, useClass: GeminiIntegrityJudge },
  { provide: QUALITY_JUDGE, useClass: GeminiQualityJudge },
  { provide: PATTERN_JUDGE, useClass: GeminiPatternJudge },
  { provide: CONSOLIDATOR_JUDGE, useClass: GeminiConsolidatorJudge },
  { provide: EXTRACTION_JUDGE, useClass: GeminiExtractionJudge },
  { provide: RECOMMENDATION_JUDGE, useClass: GeminiRecommendationJudge },
]

const fakeProviders = [
  { provide: INTEGRITY_JUDGE, useClass: FakeIntegrityJudge },
  { provide: QUALITY_JUDGE, useClass: FakeQualityJudge },
  { provide: PATTERN_JUDGE, useClass: FakePatternJudge },
  { provide: CONSOLIDATOR_JUDGE, useClass: FakeConsolidatorJudge },
  { provide: EXTRACTION_JUDGE, useClass: FakeExtractionJudge },
  { provide: RECOMMENDATION_JUDGE, useClass: FakeRecommendationJudge },
]

@Module({
  providers: [
    PromptLoaderService,
    ...(useGemini ? geminiProviders : fakeProviders),
  ],
  exports: [
    PromptLoaderService,
    INTEGRITY_JUDGE,
    QUALITY_JUDGE,
    PATTERN_JUDGE,
    CONSOLIDATOR_JUDGE,
    EXTRACTION_JUDGE,
    RECOMMENDATION_JUDGE,
  ],
})
export class JudgesModule {}
