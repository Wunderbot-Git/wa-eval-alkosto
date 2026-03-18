export enum Role {
  ADMIN = 'ADMIN',
  INTERNAL_ALKOSTO = 'INTERNAL_ALKOSTO',
  YALO_READER = 'YALO_READER',
}

export enum RunStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  COMPLETED_WITH_ERRORS = 'COMPLETED_WITH_ERRORS',
  CANCELLED = 'CANCELLED',
}

export enum ConversationStatus {
  PENDING = 'PENDING',
  EVALUATING = 'EVALUATING',
  EVALUATED = 'EVALUATED',
  NOT_EVALUABLE = 'NOT_EVALUABLE',
  FAILED = 'FAILED',
}

export enum EvaluationLabel {
  APROBADA = 'aprobada',
  CON_HALLAZGOS = 'con_hallazgos',
  FALLIDA = 'fallida',
}

export enum FindingSeverity {
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum EvaluationModule {
  INTEGRITY = 'INTEGRITY',
  QUALITY = 'QUALITY',
  PATTERNS = 'PATTERNS',
  CONSOLIDATOR = 'CONSOLIDATOR',
}

export enum MessageRole {
  CUSTOMER = 'customer',
  AGENT = 'agent',
}

export enum ShareType {
  RUN = 'RUN',
  CONVERSATION = 'CONVERSATION',
}
