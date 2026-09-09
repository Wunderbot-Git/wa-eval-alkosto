import { describe, it, expect } from 'vitest'
import { csvRows, parseEvents, sessionsFromEvents, Event } from './events'
import { validateVerdict, CRITERIA } from './workspace.service'
const event = (id: string, at: string, kind: Event['kind'], text = ''): Event => ({ id, at: `2026-08-31T${at}:00Z`, subject: 'one', kind, text, media: 'TEXT' })
describe('Yalo event ingestion', () => {
  it('reads quoted multiline and escaped CSV fields', () => {
    expect(csvRows('a;b\n"hola;\n""mundo""";x\n')).toEqual([['a', 'b'], ['hola;\n"mundo"', 'x']])
  })
  it('fails on malformed quotes rather than accepting truncated events', () => { expect(() => csvRows('a;b\n"oops')).toThrow() })
  it('retains URLs and strips recipient phones from interactive payloads', () => {
    const raw = JSON.stringify({ to: '573001234567', interactive: { body: { text: 'Compra' }, action: { parameters: { url: 'https://alkosto.com/p/123456789012' } } } }).replaceAll('"', '""')
    const csv = `user_id;is_user_message;event_timestamp;message_id;message_text;message_type;message_raw\n573001234567;false;2026-08-31 12:00:00 UTC;abc;;RAW;"${raw}"`
    const [e] = parseEvents(csv, 'secret')
    expect(JSON.stringify(e)).not.toContain('573001234567')
    expect(e.text).toContain('/p/123456789012')
    expect(parseEvents(csv + '\n' + csv.split('\n')[1], 'secret')).toHaveLength(1)
  })
  it('keeps rating associated with closure and starts a new commercial session', () => {
    const sessions = sessionsFromEvents([event('1', '12:00', 'customer', 'tablet'), event('2', '13:00', 'closure'), event('3', '13:01', 'survey'), event('4', '13:02', 'customer', '10'), event('5', '13:03', 'customer', 'Ahora un celular')])
    expect(sessions).toHaveLength(2)
    expect(sessions.find(s => s.boundary === 'CIERRE_YALO')?.rating).toBe(10)
    expect(sessions[0].events[0].text).toBe('Ahora un celular')
  })
  it('does not interpret product quantity as a survey after a new question', () => {
    const sessions = sessionsFromEvents([event('1', '12:00', 'customer'), event('2', '13:00', 'closure'), event('3', '13:01', 'survey'), event('4', '13:02', 'customer', 'Resmas'), event('5', '13:03', 'customer', '10')])
    expect(sessions.every(s => s.rating === null)).toBe(true)
  })
  it('does not merge distinct users or cut sessions at midnight', () => {
    const first = event('1', '23:55', 'customer'); const second = { ...event('2', '00:05', 'agent'), at: '2026-09-01T00:05:00Z' }
    expect(sessionsFromEvents([first, second])).toHaveLength(1)
    expect(sessionsFromEvents([first, { ...second, subject: 'two' }])).toHaveLength(2)
  })
  it('classifies who left the conversation hanging', () => {
    expect(sessionsFromEvents([event('1', '12:00', 'customer', 'busco un televisor'), event('2', '12:01', 'agent', '¿Para sala o habitación?')])[0].outcome).toBe('CLIENTE_SIN_RESPUESTA')
    expect(sessionsFromEvents([event('1', '12:00', 'customer', 'busco un televisor')])[0].outcome).toBe('AGENTE_SIN_RESPUESTA')
    expect(sessionsFromEvents([event('1', '12:00', 'customer', 'gracias'), event('2', '12:01', 'agent', 'Con gusto, feliz día')])[0].outcome).toBe('FINAL_SIN_PREGUNTA')
  })
  it('ignores closure and survey events when classifying the outcome', () => {
    const sessions = sessionsFromEvents([event('1', '12:00', 'customer', 'un celular'), event('2', '12:01', 'agent', '¿Qué presupuesto tienes?'), event('3', '13:30', 'closure'), event('4', '13:31', 'survey')])
    expect(sessions[0].outcome).toBe('CLIENTE_SIN_RESPUESTA')
  })
  it('marks inactivity and rebuilds deterministically independent of input order', () => {
    const events = [event('1', '12:00', 'customer'), event('2', '14:00', 'customer')]
    expect(sessionsFromEvents(events)).toEqual(sessionsFromEvents([...events].reverse()))
    expect(sessionsFromEvents(events)[1].boundary).toBe('INACTIVIDAD_INFERIDA')
  })
})
describe('evaluator validation', () => {
  const verdict = () => ({ summary: 'Resumen', category: 'Computadores', criteria: CRITERIA.map(name => ({ name, status: 'CUMPLE', severity: null, reason: 'Motivo', evidenceIds: ['1'] })) })
  it('does not fabricate historical accuracy and calculates coverage', () => {
    const result = validateVerdict(verdict(), new Set(['1']))
    expect(result.criteria.find((c: any) => c.name === 'exactitud').status).toBe('EVIDENCIA_INSUFICIENTE')
    expect(result.score).toBe(10); expect(result.coverage).toBe('6/7')
  })
  it('rejects invented message references and incomplete output', () => {
    expect(() => validateVerdict(verdict(), new Set())).toThrow()
    expect(() => validateVerdict({}, new Set())).toThrow()
  })
})
