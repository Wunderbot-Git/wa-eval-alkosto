import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import EvaluationDashboard from './EvaluationDashboard'
afterEach(cleanup)
const sessions = [
  { id: 'a', start: '2026-08-31T12:00:00Z', subject: 'abc', preview: 'Necesito computador', assessment: { categories: ['Computadores'], summary: 'Presupuesto excedido', criteria: [{ name: 'adecuacion', status: 'INCUMPLE', severity: 'WARNING' }, { name: 'exactitud', status: 'EVIDENCIA_INSUFICIENTE' }], score: 0, coverage: '1/2' } },
  { id: 'b', start: '2026-08-31T13:00:00Z', subject: 'def', preview: 'Busco tinta' },
]
describe('dashboard navigation', () => {
  it('opens the exact evaluation and filters pending conversations without inventing results', () => {
    const open = vi.fn()
    render(<EvaluationDashboard sessions={sessions} onOpen={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver evaluación ↗' }))
    expect(open).toHaveBeenCalledWith('a')
    fireEvent.click(screen.getByRole('button', { name: /Sin evaluar/ }))
    expect(screen.queryByRole('button', { name: 'Ver evaluación ↗' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ver conversación ↗' })).toBeTruthy()
  })
  it('drills down from a criterion to just the conversations that failed it', () => {
    render(<EvaluationDashboard sessions={sessions} onOpen={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Adecuación del producto/ }))
    expect(screen.getByRole('button', { name: 'Ver evaluación ↗' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ver conversación ↗' })).toBeNull()
  })
})
