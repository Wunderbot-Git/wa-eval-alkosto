import { describe, it, expect, vi } from 'vitest'
import { WorkspaceService } from './workspace.service'
import { hash } from './events'

describe('review workflow invariants', () => {
  it('hashes JSONB objects independent of key order', () => {
    expect(hash({ a: 1, b: { d: 2, c: 3 } })).toBe(hash({ b: { c: 3, d: 2 }, a: 1 }))
  })
  it('does not validate an issue without implementation and verification evidence', async () => {
    const update = vi.fn()
    const db = { reviewIssue: { findUnique: vi.fn().mockResolvedValue({ id: 'i', status: 'POR_VERIFICAR', payload: { history: [] } }), update } }
    const service = new WorkspaceService(db as any)
    await expect(service.updateIssue('i', { status: 'VALIDADO', implementation: 'v2', verification: '' }, 'reviewer')).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
    await service.updateIssue('i', { status: 'VALIDADO', implementation: 'v2', verification: 'Caso 1: respuesta y resultado confirmados' }, 'reviewer')
    expect(update.mock.calls[0][0].data.payload.history).toHaveLength(1)
  })
  it('preserves old human reviews when adding a disagreement', async () => {
    const update = vi.fn()
    const db = { reviewAssessment: { findUnique: vi.fn().mockResolvedValue({ payload: { verdict: { score: 8 }, reviews: [{ decision: 'DE_ACUERDO' }] } }), update } }
    const service = new WorkspaceService(db as any)
    await service.reviewAssessment('a', { decision: 'EN_DESACUERDO', note: 'Falta evidencia del presupuesto' }, 'reviewer')
    expect(update.mock.calls[0][0].data.payload.reviews).toHaveLength(2)
    expect(update.mock.calls[0][0].data.payload.verdict.score).toBe(8)
  })
  it('adds omitted carousel text without overwriting existing event fields', async () => {
    process.env.PSEUDONYM_SECRET = 'test-secret'
    const raw = JSON.stringify({ to: '3001234567', interactive: { type: 'carousel', action: { cards: [{ body: { text: 'Portátil NVIDIA 16GB' }, header: { image: { link: 'private-image' } } }] } } })
    const csv = 'user_id;is_user_message;event_timestamp;message_id;message_text;message_type;message_raw\nu1;false;2026-08-31T00:00:00Z;m1;Opciones;RAW;' + '"' + raw.replaceAll('"', '""') + '"'
    const { parseEvents } = await import('./events')
    const event = parseEvents(csv, 'test-secret')[0]
    expect(event.cardsText).toBe('Opción 1: Portátil NVIDIA 16GB')
    expect(JSON.stringify(event)).not.toContain('3001234567')
    expect(JSON.stringify(event)).not.toContain('private-image')
    const { cardsText, ...legacy } = event
    const update = vi.fn()
    const db = { $transaction: async (cb: any) => cb({ reviewEvent: {
      findMany: async () => [{ id: event.id, payload: legacy }], update,
      createMany: async () => ({ count: 0 }),
    } }), reviewEvent: { findMany: async () => [{ payload: event }] } }
    await new WorkspaceService(db as any).importCsv(Buffer.from(csv))
    expect(update.mock.calls[0][0].data.payload).toEqual(event)
  })
  it('requires observed responses and version for manual test executions', async () => {
    const update = vi.fn()
    const db = { reviewTest: { findUnique: vi.fn().mockResolvedValue({ payload: { executions: [] } }), update } }
    const service = new WorkspaceService(db as any)
    await expect(service.executeTest('t', { result: 'PASA', response: '', version: '' }, 'reviewer')).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })
  it('does not silently rewrite an existing imported message', async () => {
    process.env.PSEUDONYM_SECRET = 'test-secret'
    const csv = 'user_id;is_user_message;event_timestamp;message_id;message_text;message_type\nu1;true;2026-08-31T00:00:00Z;m1;Hola;TEXT'
    const { parseEvents } = await import('./events')
    const event = parseEvents(csv, 'test-secret')[0]
    const createMany = vi.fn()
    const db = { $transaction: async (callback: any) => callback({ reviewEvent: { findMany: async () => [{ id: event.id, payload: { ...event, text: 'Original distinto' } }], createMany } }) }
    await expect(new WorkspaceService(db as any).importCsv(Buffer.from(csv))).rejects.toThrow('contradictoria')
    expect(createMany).not.toHaveBeenCalled()
  })
})
