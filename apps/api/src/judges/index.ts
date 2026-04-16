export { JudgesModule } from './judges.module'
export { PromptLoaderService } from './prompt-loader.service'
export type {
  IntegrityJudge,
  IntegrityJudgeResult,
  QualityJudge,
  QualityJudgeResult,
  PatternJudge,
  PatternJudgeResult,
  ConsolidatorJudge,
  ConsolidatorResult,
  ExtractionJudge,
  ExtractionResult,
  ExtractedNeeds,
  RecommendationJudge,
  RecommendationJudgeResult,
  RecommendationFinding,
  ProductSpecSheet,
} from './judge.interfaces'
export {
  INTEGRITY_JUDGE,
  QUALITY_JUDGE,
  PATTERN_JUDGE,
  CONSOLIDATOR_JUDGE,
  EXTRACTION_JUDGE,
  RECOMMENDATION_JUDGE,
} from './judge.tokens'
