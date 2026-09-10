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
  it('collapses ingestion retries and keeps contradictory ids as separate events', () => {
    const header = 'user_id;is_user_message;event_timestamp;message_id;message_text;message_type'
    const row = (ts: string, text: string) => `u1;false;2026-08-31 ${ts} UTC;dup;${text};TEXT`
    // Identical content seconds apart: one event, earliest timestamp wins.
    const retry = parseEvents([header, row('12:00:00', 'hola'), row('12:00:02', 'hola')].join('\n'), 'secret')
    expect(retry).toHaveLength(1)
    expect(retry[0].at).toBe('2026-08-31T12:00:00.000Z')
    // Different content under one id: both survive, the import does not abort.
    const stats = { conflicts: 0, skipped: 0, rawInvalid: 0 }
    const conflicting = parseEvents([header, row('12:00:00', 'hola'), row('12:05:00', 'otro texto')].join('\n'), 'secret', stats)
    expect(conflicting).toHaveLength(2)
    expect(stats.conflicts).toBe(1)
    expect(new Set(conflicting.map(e => e.id)).size).toBe(2)
    // Reversed input order yields the same ids, so re-imports deduplicate.
    const reversed = parseEvents([header, row('12:05:00', 'otro texto'), row('12:00:00', 'hola')].join('\n'), 'secret')
    expect(new Set(reversed.map(e => e.id))).toEqual(new Set(conflicting.map(e => e.id)))
  })
  it('skips unattributable rows and keeps messages without an id', () => {
    const header = 'user_id;is_user_message;event_timestamp;message_id;message_text;message_type'
    const stats = { conflicts: 0, skipped: 0, rawInvalid: 0 }
    const events = parseEvents([
      header,
      ';false;2026-08-31 12:00:00 UTC;m1;sin usuario;TEXT',
      'u1;;2026-08-31 12:00:00 UTC;m2;sin rol;TEXT',
      'u1;true;;m3;sin fecha;TEXT',
      'u1;true;2026-08-31 12:01:00 UTC;;hola sin id;TEXT',
      'u1;true;2026-08-31 12:01:00 UTC;;hola sin id;TEXT',
      'u1;false;2026-08-31 12:02:00 UTC;m4;con id;TEXT',
    ].join('\n'), 'secret', stats)
    expect(stats.skipped).toBe(3)
    expect(events.map(e => e.text)).toEqual(['hola sin id', 'con id'])
    expect(new Set(events.map(e => e.id)).size).toBe(2)
  })
  it('keeps the plain text when an interactive payload is unreadable', () => {
    const header = 'user_id;is_user_message;event_timestamp;message_id;message_text;message_type;message_raw'
    const stats = { conflicts: 0, skipped: 0, rawInvalid: 0 }
    const [e] = parseEvents([header, 'u1;false;2026-08-31 12:00:00 UTC;m1;Compra aquí;RAW;"{roto"'].join('\n'), 'secret', stats)
    expect(stats.rawInvalid).toBe(1)
    expect(e.text).toBe('Compra aquí')
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
    // Greeting only, no dialogue after the agent's first message.
    expect(sessionsFromEvents([event('1', '12:00', 'customer', 'busco un televisor'), event('2', '12:01', 'agent', '¿Para sala o habitación?')])[0].outcome).toBe('SIN_INTERACCION')
    expect(sessionsFromEvents([event('1', '12:00', 'customer', 'busco un televisor')])[0].outcome).toBe('AGENTE_SIN_RESPUESTA')
    expect(sessionsFromEvents([event('1', '12:00', 'customer', 'un celular'), event('2', '12:01', 'agent', '¿Para qué uso?'), event('3', '12:02', 'customer', 'para juegos'), event('4', '12:03', 'agent', '¿Qué presupuesto tienes?')])[0].outcome).toBe('CLIENTE_SIN_RESPUESTA')
    expect(sessionsFromEvents([event('1', '12:00', 'customer', 'un celular'), event('2', '12:01', 'agent', '¿marca?'), event('3', '12:02', 'customer', 'gracias'), event('4', '12:03', 'agent', 'Con gusto, feliz día')])[0].outcome).toBe('FINAL_SIN_PREGUNTA')
  })
  it('ignores closure and survey events when classifying the outcome', () => {
    const sessions = sessionsFromEvents([event('1', '12:00', 'customer', 'un celular'), event('2', '12:01', 'agent', '¿Qué presupuesto tienes?'), event('3', '12:02', 'customer', '2 millones'), event('4', '12:03', 'agent', '¿Alguna marca preferida?'), event('5', '13:30', 'closure'), event('6', '13:31', 'survey')])
    expect(sessions[0].outcome).toBe('CLIENTE_SIN_RESPUESTA')
  })
  it('rates reconstruction confidence from edges and gaps', () => {
    // Filler events push the data window far from the conversation on both sides.
    const filler = [{ ...event('f1', '12:00', 'trace'), subject: 'filler', at: '2026-08-25T12:00:00Z' }, { ...event('f2', '12:00', 'trace'), subject: 'filler', at: '2026-09-05T12:00:00Z' }]
    const closed = sessionsFromEvents([...filler, event('1', '12:00', 'customer', 'un televisor'), event('2', '12:05', 'agent', 'claro'), event('3', '13:00', 'closure')]).find(s => s.subject === 'one')!
    expect(closed.reconstruction).toMatchObject({ confidence: 'ALTA', startReason: 'PRIMER_CONTACTO', endReason: 'CIERRE_YALO' })

    const silent = sessionsFromEvents([...filler, event('1', '12:00', 'customer', 'un televisor'), event('2', '12:05', 'agent', '¿marca?')]).find(s => s.subject === 'one')!
    expect(silent.reconstruction).toMatchObject({ confidence: 'ALTA', endReason: 'SILENCIO' })
  })
  it('flags data-edge truncation and borderline splits as low confidence', () => {
    const edge = sessionsFromEvents([event('1', '12:00', 'customer', 'hola'), event('2', '12:05', 'agent', 'hola')])[0]
    expect(edge.reconstruction).toMatchObject({ confidence: 'BAJA', startReason: 'BORDE_DE_DATOS', endReason: 'BORDE_DE_DATOS' })

    const filler = [{ ...event('f1', '12:00', 'trace'), subject: 'filler', at: '2026-08-25T12:00:00Z' }, { ...event('f2', '12:00', 'trace'), subject: 'filler', at: '2026-09-05T12:00:00Z' }]
    const split = sessionsFromEvents([...filler, event('1', '12:00', 'customer', 'hola'), event('2', '13:05', 'customer', 'sigo aquí')]).filter(s => s.subject === 'one')
    expect(split).toHaveLength(2)
    // 65-minute gap: barely over the 1h threshold on both sides of the split
    expect(split.every(s => s.reconstruction?.confidence === 'BAJA')).toBe(true)
    expect(split.find(s => s.reconstruction?.startReason === 'TRAS_INACTIVIDAD')?.reconstruction?.gapBeforeMin).toBe(65)
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
    expect(result.fricciones).toEqual([])
  })
  it('keeps only channel frictions with verifiable evidence and never scores them', () => {
    const value = { ...verdict(), fricciones: [
      { description: 'El cliente envió fotos que el canal no procesa', evidenceIds: ['1', 'inventado'] },
      { description: '', evidenceIds: ['1'] },
      { description: 'Sin evidencia', evidenceIds: [] },
    ] }
    const result = validateVerdict(value, new Set(['1']))
    expect(result.fricciones).toEqual([{ description: 'El cliente envió fotos que el canal no procesa', evidenceIds: ['1'] }])
    expect(result.score).toBe(10)
    expect(result.label).toBe('SIN_HALLAZGOS_OBSERVADOS')
  })
  it('rejects invented message references and incomplete output', () => {
    expect(() => validateVerdict(verdict(), new Set())).toThrow()
    expect(() => validateVerdict({}, new Set())).toThrow()
  })
})
