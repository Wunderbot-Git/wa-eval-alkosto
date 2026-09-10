import { describe, it, expect, vi } from 'vitest'
import { RUBRIC_VERSION, WorkspaceService, previousDayWindow } from './workspace.service'
import { hash } from './events'

describe('previousDayWindow', () => {
  it('covers yesterday 00:00 to today 00:00 in Bogota time', () => {
    // 2026-09-09 09:00 in Bogota (14:00 UTC)
    expect(previousDayWindow(new Date('2026-09-09T14:00:00Z'))).toEqual({ from: '2026-09-08T05:00:00.000Z', to: '2026-09-09T05:00:00.000Z' })
  })
  it('uses the Bogota calendar day around midnight UTC', () => {
    // 2026-09-08 22:00 in Bogota is already 2026-09-09 03:00 UTC
    expect(previousDayWindow(new Date('2026-09-09T03:00:00Z'))).toEqual({ from: '2026-09-07T05:00:00.000Z', to: '2026-09-08T05:00:00.000Z' })
  })
  it('extends the window backwards for self-healing multi-day imports', () => {
    expect(previousDayWindow(new Date('2026-09-09T14:00:00Z'), 2)).toEqual({ from: '2026-09-07T05:00:00.000Z', to: '2026-09-09T05:00:00.000Z' })
  })
})

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
  it('refuses to evaluate a conversation ending at the data edge', async () => {
    const { sessionsFromEvents } = await import('./events')
    const events = [
      { id: 'e1', subject: 'u1', at: '2026-09-08T23:00:00Z', kind: 'customer', text: 'busco un televisor', media: 'TEXT' },
      { id: 'e2', subject: 'u1', at: '2026-09-08T23:01:00Z', kind: 'agent', text: '¿de qué tamaño?', media: 'TEXT' },
    ]
    const [session] = sessionsFromEvents(events as any)
    expect(session.reconstruction?.endReason).toBe('BORDE_DE_DATOS')
    const db = {
      reviewEvent: { findMany: async () => events.map(e => ({ payload: e })) },
      reviewAssessment: { findMany: async () => [] },
    }
    await expect(new WorkspaceService(db as any).evaluate(session.id)).rejects.toThrow('podría continuar')
  })
  it('queues only unevaluated candidates and reports batch progress', async () => {
    process.env.PSEUDONYM_SECRET = 'test-secret'
    const { parseEvents } = await import('./events')
    const header = 'user_id;is_user_message;event_timestamp;message_id;message_text;message_type'
    const talk = (user: string, hour: string) => [0, 1, 2, 3].map(i => `${user};${i % 2 === 0};2026-08-31 ${hour}:0${i}:00 UTC;${user}${i};texto;TEXT`)
    const events = parseEvents([header,
      ...talk('rich', '12'), ...talk('other', '13'),
      'thin;true;2026-08-31 14:00:00 UTC;t1;texto;TEXT', 'thin;false;2026-08-31 14:01:00 UTC;t2;texto;TEXT',
      ...talk('edge', '23'),
    ].join('\n'), 'test-secret')
    const reviewEvent = { findMany: async () => events.map(e => ({ payload: e })) }
    const build = (assessments: any[]) => new WorkspaceService({ reviewEvent, reviewAssessment: { findMany: async () => assessments } } as any)
    const all = await build([]).sessions()
    const of = (id: string) => all.find(s => s.events.some(e => e.id === id))!
    // Newest first, so a capped run covers the most recent conversations.
    // The two-message exchange and the one ending at the data cutoff never
    // enter the queue.
    expect(await build([]).pendingCandidates(10)).toEqual([of(events[4].id).id, of(events[0].id).id])
    const current = of(events[0].id)
    expect(await build([{ sessionId: current.id, inputHash: current.inputHash, payload: { rubricVersion: RUBRIC_VERSION } }]).pendingCandidates(10)).toEqual([of(events[4].id).id])
    // A stale evaluation is queued again; a cap trims the queue.
    expect(await build([{ sessionId: current.id, inputHash: 'changed', payload: { rubricVersion: RUBRIC_VERSION } }]).pendingCandidates(1)).toHaveLength(1)

    const service = build([])
    vi.spyOn(service, 'evaluate').mockRejectedValue(new Error('Vertex AI no respondió'))
    // One failure must not abort the rest of the batch.
    const result = await service.evaluateBatch(await service.pendingCandidates(10))
    expect(result).toMatchObject({ running: false, total: 2, done: 0, failed: 2, lastError: 'Vertex AI no respondió' })
    const empty = new WorkspaceService({ reviewEvent: { findMany: async () => [] }, reviewAssessment: { findMany: async () => [] } } as any)
    await expect(empty.startPendingEvaluation({})).rejects.toThrow('No hay conversaciones aptas')
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
