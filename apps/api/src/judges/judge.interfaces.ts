export interface IntegrityFinding {
  type: string
  severity: 'WARNING' | 'CRITICAL'
  description: string
  evidence?: string
}

export interface IntegrityJudgeResult {
  findings: IntegrityFinding[]
}

export interface QualitySubScores {
  understanding: number
  recommendation: number
  fluency: number
}

export interface QualityFinding {
  description: string
  messageRef?: number
}

export interface QualityJudgeResult {
  score: number // 0.0-10.0
  subScores: QualitySubScores
  findings: QualityFinding[]
}

export interface PatternClassification {
  name: string
  isEmergent: boolean
  explanation?: string
  evidence?: string
}

export interface PatternJudgeResult {
  classifications: PatternClassification[]
}

export interface ConsolidatorResult {
  score: number // 0.0-10.0
  label: 'aprobada' | 'con_hallazgos' | 'fallida'
  explanation: string
}

export interface MessageLike {
  role: string
  content: string
  orderIndex: number
}

export interface CatalogProductLike {
  externalId: string
  title: string
  listPrice?: number | null
  salePrice?: number | null
  category?: string | null
  brand?: string | null
}

/**
 * Full structured spec sheet for a single product, derived from the canonical
 * Alkosto source row stored in CatalogProduct.rawData. Sent to the integrity
 * and recommendation judges only for the products actually mentioned in the
 * conversation, to keep payloads bounded.
 */
export interface ProductSpecSheet {
  externalId: string
  title: string
  listPrice?: number | null
  salePrice?: number | null
  availability?: number | null
  category?: string | null
  brand?: string | null
  /** Canonical structured fields from rawData (Tarjeta Grafica, Memoria RAM,
   *  Procesador, Capacidad de Disco, Sistema Operativo, etc.). NaN / null
   *  values are stripped by the worker before sending to the LLM. */
  specs: Record<string, string | number | boolean | null>
}

export interface ExtractedNeeds {
  use_case?: string | null
  budget_min?: number | null
  budget_max?: number | null
  must_have_specs?: string[]
  deal_breakers?: string[]
}

export interface ExtractionResult {
  mentionedExternalIds: string[]
  statedNeeds: ExtractedNeeds
}

export interface ExtractionJudge {
  evaluate(
    transcript: MessageLike[],
    catalog: CatalogProductLike[],
  ): Promise<ExtractionResult>
}

export interface RecommendationFinding {
  type: string
  severity: 'WARNING' | 'CRITICAL'
  description: string
  evidence?: string
}

export interface RecommendationJudgeResult {
  findings: RecommendationFinding[]
  summary?: string
}

export interface RecommendationJudge {
  evaluate(
    transcript: MessageLike[],
    statedNeeds: ExtractedNeeds,
    mentionedSpecs: ProductSpecSheet[],
    candidateAlternatives: CatalogProductLike[],
  ): Promise<RecommendationJudgeResult>
}

export interface IntegrityJudge {
  evaluate(
    transcript: MessageLike[],
    catalog: CatalogProductLike[],
    mentionedSpecs?: ProductSpecSheet[],
  ): Promise<IntegrityJudgeResult>
}

export interface QualityJudge {
  evaluate(transcript: MessageLike[]): Promise<QualityJudgeResult>
}

export interface PatternJudge {
  evaluate(transcript: MessageLike[]): Promise<PatternJudgeResult>
}

export interface ConsolidatorJudge {
  consolidate(
    integrity: IntegrityJudgeResult | null,
    quality: QualityJudgeResult | null,
    patterns: PatternJudgeResult | null,
    recommendation?: RecommendationJudgeResult | null,
  ): Promise<ConsolidatorResult>
}
