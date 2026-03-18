import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// Mock next/navigation
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// Mock fetch
const fetchMock = vi.fn()
global.fetch = fetchMock

import LoginPage from './page'

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders email and password fields', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/correo/i)).toBeDefined()
    expect(screen.getByLabelText(/contraseña/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeDefined()
  })

  it('shows validation error if email is empty', async () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('correo es requerido')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows validation error if password is empty', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/correo/i), {
      target: { value: 'admin@test.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('contraseña es requerida')
    })
  })

  it('calls API and redirects on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '1', email: 'admin@test.com', role: 'ADMIN' }),
    })

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/correo/i), {
      target: { value: 'admin@test.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'secret' },
    })
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/')
    })
  })

  it('shows server error on failed login', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Credenciales inválidas' }),
    })

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/correo/i), {
      target: { value: 'admin@test.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Credenciales inválidas')
    })
  })

  it('shows connection error when fetch fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'))

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/correo/i), {
      target: { value: 'admin@test.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'pw' },
    })
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Error de conexión')
    })
  })
})
