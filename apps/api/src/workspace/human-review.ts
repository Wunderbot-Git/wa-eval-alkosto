import { BadRequestException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { redact } from './events'
export function reviewState(history: any[]) {
  const undone = new Set(history.filter(h => h.action === 'undo').map(h => h.target))
  const active = history.filter(h => !undone.has(h.id) && h.action !== 'undo')
  const decisions: Record<string, any> = {}
  for (const h of active) if (h.action === 'decision') decisions[h.criterion] = h
  return { decisions, additions: active.filter(h => h.action === 'add'), completed: history.at(-1)?.action === 'complete' }
}
export function reviewAction(payload: any, events: any[], body: any, userId: string) {
  const history = payload.humanReview || []; const state = reviewState(history)
  const fail = (message: string): never => { throw new BadRequestException(message) }
  const text = (value: any, required = false) => { if (typeof value !== 'string' || value.length > 4000 || (required && !value.trim())) return fail('Escribe un comentario válido (máximo 4000 caracteres).'); return redact(value.trim()) }
  const criteria = payload.verdict.criteria
  const entry: any = { id: randomUUID(), action: body.action, userId, at: new Date().toISOString() }
  let entries: any[] = [entry]
  if (body.action === 'decision') {
    if (!criteria.some((c: any) => c.name === body.criterion) || !['confirm', 'correct', 'dismiss', 'defer'].includes(body.decision)) fail('Decisión o criterio inválido')
    Object.assign(entry, { criterion: body.criterion, decision: body.decision, note: text(body.note || '', body.decision !== 'confirm') })
    if (body.decision === 'correct') {
      if (!criteria.some((c: any) => c.name === body.correctedCriterion) || !['WARNING', 'CRITICAL'].includes(body.severity)) fail('Selecciona criterio y gravedad')
      Object.assign(entry, { correctedCriterion: body.correctedCriterion, severity: body.severity })
    }
    // One root cause often fans out into several criteria citing the same
    // evidence: the same decision may be applied to additional findings in
    // one call. Separate history entries keep undo and the audit trail
    // per criterion; corrections stay strictly one criterion at a time.
    const also: any[] = Array.isArray(body.alsoCriteria) ? body.alsoCriteria : []
    if (also.length) {
      if (body.decision === 'correct') fail('Corrige cada hallazgo por separado')
      const targets = [body.criterion, ...also]
      if (new Set(targets).size !== targets.length || also.some((name: any) => !criteria.some((c: any) => c.name === name))) fail('Criterios repetidos o inválidos')
      entries = targets.map((name: any) => ({ ...entry, id: randomUUID(), criterion: name }))
    }
  } else if (body.action === 'add') {
    if (!['finding', 'positive'].includes(body.kind) || !criteria.some((c: any) => c.name === body.criterion)) fail('Tipo o criterio inválido')
    if (!Array.isArray(body.evidenceIds) || !body.evidenceIds.length || body.evidenceIds.some((id: any) => !events.some(e => e.id === id))) fail('Selecciona mensajes de esta conversación')
    if (body.kind === 'finding' && !['WARNING', 'CRITICAL'].includes(body.severity)) fail('Selecciona la gravedad')
    Object.assign(entry, { kind: body.kind, criterion: body.criterion, note: text(body.note, true), severity: body.kind === 'finding' ? body.severity : null, evidenceIds: [...new Set(body.evidenceIds)] })
  } else if (body.action === 'undo') {
    const last = history.at(-1)
    if (!last || last.id !== body.target || last.userId !== userId || !['decision', 'add', 'complete'].includes(last.action)) fail('Solo puedes deshacer tu última acción. Actualiza la conversación.')
    entry.target = last.id
  } else if (body.action === 'complete') {
    if (body.readConversation !== true) fail('Confirma que revisaste la conversación completa')
    if (criteria.some((c: any) => c.status === 'INCUMPLE' && !state.decisions[c.name]) || Object.values(state.decisions).some((d: any) => d.decision === 'defer')) fail('Resuelve los hallazgos pendientes antes de finalizar')
    entry.readConversation = true
  } else fail('Acción inválida')
  return { ...payload, humanReview: [...history, ...entries] }
}
