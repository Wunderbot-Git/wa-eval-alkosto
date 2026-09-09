import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReviewDesk from './ReviewDesk'
const detail = { id: 's1', subject: 'private123', inputHash: 'hash', rubricVersion: 'pilot-2', incompleteStart: true,
  events: [
    { id: 'e1', kind: 'customer', text: 'Hasta un millón', at: '2026-08-31T15:00:00Z', media: 'TEXT' },
    { id: 'e2', kind: 'agent', text: 'Opción de dos millones', cardsText: 'Producto portátil', at: '2026-08-31T15:01:00Z', media: 'RAW' },
    { id: 'e3', kind: 'survey', text: 'Encuesta', at: '2026-08-31T15:02:00Z', media: 'TEXT' },
    { id: 'e4', kind: 'agent', text: 'Otra recomendación', at: '2026-08-31T15:03:00Z', media: 'TEXT' },
  ],
  assessments: [{ id: 'a1', inputHash: 'hash', payload: { rubricVersion: 'pilot-2', reviews: [], verdict: { summary: 'Presupuesto excedido', score: 5, coverage: '1/2', criteria: [
    { name: 'adecuacion', status: 'INCUMPLE', severity: 'WARNING', reason: 'Supera el presupuesto', evidenceIds: ['e4', 'e2'] },
    { name: 'exactitud', status: 'EVIDENCIA_INSUFICIENTE', reason: 'Falta catálogo', evidenceIds: [] },
  ] } } }],
}
const sessions = [{ id: 's1', subject: 'private123', start: '2026-08-31T15:00:00Z', assessment: { criteria: detail.assessments[0].payload.verdict.criteria } }]
beforeEach(() => { HTMLElement.prototype.scrollTo = vi.fn(); vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0)); vi.stubGlobal('cancelAnimationFrame', clearTimeout) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('review desk evidence workflow', () => {
  it('highlights only cited messages and navigates them in chronological order', async () => {
    const api = vi.fn().mockResolvedValue(detail)
    const { container } = render(<ReviewDesk sessions={sessions} selectedId="s1" onSelect={() => {}} api={api} onRefresh={async () => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Adecuación del producto/ }))
    await waitFor(() => expect(container.querySelector('.wa-focused')?.getAttribute('data-message-id')).toBe('e2'))
    expect(container.querySelectorAll('[data-evidence="true"]')).toHaveLength(2)
    expect(container.querySelector('[data-message-id="e3"]')?.getAttribute('data-evidence')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Evidencia siguiente' }))
    await waitFor(() => expect(container.querySelector('.wa-focused')?.getAttribute('data-message-id')).toBe('e4'))
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Exactitud de la información/ }))
    expect(container.querySelectorAll('[data-evidence="true"]')).toHaveLength(0)
    expect(screen.getByText('Este criterio no cita mensajes disponibles.')).toBeTruthy()
  })
  it('persists the reviewers decision for the selected assessment without reevaluating', async () => {
    const api = vi.fn().mockResolvedValue(detail)
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<ReviewDesk sessions={sessions} selectedId="s1" onSelect={() => {}} api={api} onRefresh={refresh} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    fireEvent.change(screen.getByLabelText('¿Por qué no corresponde?'), { target: { value: 'Es una preferencia, no un requisito.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar decisión' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/assessments/a1/guided-review', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"decision":"dismiss"') })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(api.mock.calls.some(([path]) => path.endsWith('/evaluate'))).toBe(false)
  })
  it('clears evidence selection when switching to another conversation', async () => {
    const second = { ...detail, id: 's2', subject: 'another456', assessments: [] }
    const api = vi.fn().mockImplementation(async (path: string) => path.endsWith('s2') ? second : detail)
    const props = { sessions: [...sessions, { ...sessions[0], id: 's2' }], onSelect: () => {}, api, onRefresh: async () => {} }
    const view = render(<ReviewDesk {...props} selectedId="s1" />)
    fireEvent.click(await screen.findByRole('button', { name: /Adecuación del producto/ }))
    expect(view.container.querySelectorAll('[data-evidence="true"]')).toHaveLength(2)
    view.rerender(<ReviewDesk {...props} selectedId="s2" />)
    await screen.findByText('Esta conversación todavía no tiene una evaluación. Puedes leer el chat completo a la derecha.')
    expect(view.container.querySelectorAll('[data-evidence="true"]')).toHaveLength(0)
  })
  it('does not let a stale evaluation be confirmed as current', async () => {
    const api = vi.fn().mockResolvedValue({ ...detail, inputHash: 'new-hash' })
    render(<ReviewDesk sessions={sessions} selectedId="s1" onSelect={() => {}} api={api} onRefresh={async () => {}} />)
    const button = await screen.findByRole('button', { name: '✓ Confirmar' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })
  it('creates a human finding from selected chat messages', async () => {
    const api = vi.fn().mockResolvedValue(detail)
    render(<ReviewDesk sessions={sessions} selectedId="s1" onSelect={() => {}} api={api} onRefresh={async () => {}} />)
    // Message checkboxes only appear once observation mode is activated.
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar mensaje 1' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: /Añadir hallazgo u observación/ }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seleccionar mensaje 1' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar mensaje 2' }))
    fireEvent.change(screen.getByLabelText('Tu observación'), { target: { value: 'La recomendación supera el presupuesto.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar observación' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/assessments/a1/guided-review', expect.objectContaining({ body: expect.stringContaining('"evidenceIds":["e1","e2"]') })))
  })
  it('shows conversation cards and opens the focus overlay on click', async () => {
    const api = vi.fn().mockResolvedValue(detail)
    render(<ReviewDesk sessions={sessions} selectedId="" onSelect={() => {}} api={api} onRefresh={async () => {}} />)
    // Grid first: no review content until a card is opened.
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: /Sin consulta visible/ }))
    await screen.findByRole('dialog')
    await screen.findByRole('button', { name: '✓ Confirmar' })
    fireEvent.click(screen.getByRole('button', { name: '✕ Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('only advances after the completion request succeeds', async () => {
    const completedFinding = { ...detail, assessments: [{ ...detail.assessments[0], payload: { ...detail.assessments[0].payload, humanReview: [{ id: 'r', action: 'decision', criterion: 'adecuacion', decision: 'confirm', at: '2026-09-08T10:00:00Z', userId: 'u' }] } }] }
    const api = vi.fn().mockImplementation(async (_path, options) => { if (options?.method === 'POST') throw new Error('No se pudo guardar'); return completedFinding })
    const next = vi.fn()
    render(<ReviewDesk sessions={[...sessions, { ...sessions[0], id: 's2' }]} selectedId="s1" onSelect={next} api={api} onRefresh={async () => {}} />)
    const finish = await screen.findByRole('button', { name: 'Finalizar revisión y continuar →' })
    expect((finish as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Revisé el resto/ }))
    fireEvent.click(finish)
    await screen.findByRole('alert')
    expect(next).not.toHaveBeenCalled()
  })

})
