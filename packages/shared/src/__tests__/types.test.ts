import { describe, it, expect } from 'vitest'
import {
  Role,
  RunStatus,
  ConversationStatus,
  EvaluationLabel,
  FindingSeverity,
  EvaluationModule,
  MessageRole,
  ShareType,
} from '../index'
import type { HealthResponse, UserSession } from '../index'

describe('shared enums', () => {
  it('Role has expected values', () => {
    expect(Object.values(Role)).toEqual(['ADMIN', 'INTERNAL_ALKOSTO', 'YALO_READER'])
  })

  it('RunStatus has expected values', () => {
    expect(Object.values(RunStatus)).toContain('PROCESSING')
    expect(Object.values(RunStatus)).toContain('CANCELLED')
  })

  it('ConversationStatus has expected values', () => {
    expect(Object.values(ConversationStatus)).toContain('NOT_EVALUABLE')
  })

  it('EvaluationLabel uses Spanish lowercase', () => {
    expect(EvaluationLabel.APROBADA).toBe('aprobada')
    expect(EvaluationLabel.CON_HALLAZGOS).toBe('con_hallazgos')
    expect(EvaluationLabel.FALLIDA).toBe('fallida')
  })

  it('FindingSeverity has warning and critical', () => {
    expect(Object.values(FindingSeverity)).toEqual(['WARNING', 'CRITICAL'])
  })

  it('EvaluationModule includes consolidator', () => {
    expect(Object.values(EvaluationModule)).toContain('CONSOLIDATOR')
  })

  it('MessageRole uses customer/agent', () => {
    expect(MessageRole.CUSTOMER).toBe('customer')
    expect(MessageRole.AGENT).toBe('agent')
  })

  it('ShareType has run and conversation', () => {
    expect(Object.values(ShareType)).toEqual(['RUN', 'CONVERSATION'])
  })
})

describe('shared types', () => {
  it('HealthResponse satisfies expected shape', () => {
    const response: HealthResponse = { status: 'ok', timestamp: new Date().toISOString() }
    expect(response.status).toBe('ok')
  })

  it('UserSession satisfies expected shape', () => {
    const session: UserSession = { id: '1', email: 'test@test.com', role: Role.ADMIN }
    expect(session.role).toBe('ADMIN')
  })
})
