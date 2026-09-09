import { describe, it, expect, vi } from 'vitest'
import { reviewAction, reviewState } from './human-review'
import { RUBRIC_VERSION, WorkspaceService } from './workspace.service'
const payload = { rubricVersion: RUBRIC_VERSION, verdict: { criteria: [{ name: 'adecuacion', status: 'INCUMPLE' }] } }
const events = [{ id: 'e1' }]
const act = (p: any, body: any) => reviewAction(p, events, body, 'u1')
describe('guided review safeguards', () => {
  it('keeps the model verdict and a reversible audit trail', () => {
    const p = act(payload, { action: 'decision', criterion: 'adecuacion', decision: 'confirm' })
    expect(p.verdict).toEqual(payload.verdict)
    expect(reviewState(p.humanReview).decisions.adecuacion.decision).toBe('confirm')
    const undo = act(p, { action: 'undo', target: p.humanReview[0].id })
    expect(reviewState(undo.humanReview).decisions).toEqual({})
    expect(undo.humanReview).toHaveLength(2)
  })
  it('requires reasons for dismissing and context for deferral', () => {
    for (const decision of ['dismiss', 'correct', 'defer']) expect(() => act(payload, { action: 'decision', criterion: 'adecuacion', decision })).toThrow()
  })
  it('rejects evidence from another conversation and empty observations', () => {
    expect(() => act(payload, { action: 'add', kind: 'finding', criterion: 'adecuacion', severity: 'WARNING', note: 'Problem', evidenceIds: ['foreign'] })).toThrow()
    expect(() => act(payload, { action: 'add', kind: 'positive', criterion: 'adecuacion', note: ' ', evidenceIds: ['e1'] })).toThrow()
  })
  it('prevents completion until findings and full conversation are reviewed', () => {
    expect(() => act(payload, { action: 'complete', readConversation: true })).toThrow()
    const p = act(payload, { action: 'decision', criterion: 'adecuacion', decision: 'defer', note: 'Falta contexto' })
    expect(() => act(p, { action: 'complete', readConversation: true })).toThrow()
    const done = act(p, { action: 'decision', criterion: 'adecuacion', decision: 'confirm' })
    expect(() => act(done, { action: 'complete' })).toThrow()
    expect(reviewState(act(done, { action: 'complete', readConversation: true }).humanReview).completed).toBe(true)
  })
  it('cannot undo another reviewer or a superseded action', () => {
    const p = act(payload, { action: 'decision', criterion: 'adecuacion', decision: 'confirm' })
    expect(() => reviewAction(p, events, { action: 'undo', target: p.humanReview[0].id }, 'u2')).toThrow()
    expect(() => act(p, { action: 'undo', target: 'old' })).toThrow()
  })
  it('rejects stale input and concurrent changes without overwriting', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const service = new WorkspaceService({ reviewAssessment: { findUnique: async () => ({ id: 'a', sessionId: 's', inputHash: 'h', payload }), updateMany } } as any)
    vi.spyOn(service, 'detail').mockResolvedValue({ inputHash: 'changed', assessments: [{ id: 'a' }] } as any)
    await expect(service.guidedReview('a', { version: 0 }, 'u1')).rejects.toThrow()
    expect(updateMany).not.toHaveBeenCalled()
    vi.mocked(service.detail).mockResolvedValue({ inputHash: 'h', assessments: [{ id: 'a' }], events } as any)
    await expect(service.guidedReview('a', { version: 1 }, 'u1')).rejects.toThrow()
    await expect(service.guidedReview('a', { version: 0, action: 'decision', criterion: 'adecuacion', decision: 'confirm' }, 'u1')).rejects.toThrow('La revisión cambió')
  })
})
