import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const fetchMock = vi.fn()
global.fetch = fetchMock

import Home from './page'

describe('Home page', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {})) // never resolves
    render(<Home />)
    expect(screen.getByText(/cargando/i)).toBeDefined()
  })

  it('displays user info after successful auth', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '1', email: 'admin@alkosto.com', role: 'ADMIN' }),
    })
    render(<Home />)
    await waitFor(() => {
      expect(screen.getByText('admin@alkosto.com')).toBeDefined()
    })
    expect(screen.getByText(/ADMIN/)).toBeDefined()
  })

  it('redirects to login if not authenticated', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false })
    render(<Home />)
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/login')
    })
  })
})
