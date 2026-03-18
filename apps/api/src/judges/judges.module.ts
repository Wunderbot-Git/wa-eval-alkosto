import { Module, Logger } from '@nestjs/common'
import { FakeIntegrityJudge } from './fake-integrity.judge'
import { FakeQualityJudge } from './fake-quality.judge'
import { FakePatternJudge } from './fake-pattern.judge'
import { FakeConsolidatorJudge } from './fake-consolidator.judge'
import { GeminiClientService } from './gemini/gemini-client.service'
import { GeminiIntegrityJudge } from './gemini/gemini-integrity.judge'
import { GeminiQualityJudge } from './gemini/gemini-quality.judge'
import { GeminiPatternJudge } from './gemini/gemini-pattern.judge'
import { GeminiConsolidatorJudge } from './gemini/gemini-consolidator.judge'
import { PromptLoaderService } from './prompt-loader.service'
import {
  INTEGRITY_JUDGE,
  QUALITY_JUDGE,
  PATTERN_JUDGE,
  CONSOLIDATOR_JUDGE,
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
]

const fakeProviders = [
  { provide: INTEGRITY_JUDGE, useClass: FakeIntegrityJudge },
  { provide: QUALITY_JUDGE, useClass: FakeQualityJudge },
  { provide: PATTERN_JUDGE, useClass: FakePatternJudge },
  { provide: CONSOLIDATOR_JUDGE, useClass: FakeConsolidatorJudge },
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
  ],
})
export class JudgesModule {}
