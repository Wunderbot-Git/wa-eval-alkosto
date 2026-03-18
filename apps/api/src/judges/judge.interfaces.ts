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

export interface IntegrityJudge {
  evaluate(transcript: MessageLike[], catalog: CatalogProductLike[]): Promise<IntegrityJudgeResult>
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
  ): Promise<ConsolidatorResult>
}
