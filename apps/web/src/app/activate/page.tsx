'use client'

import { useState, useEffect, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function ActivatePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
      <ActivateForm />
    </Suspense>
  )
}

function ActivateForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [tokenError, setTokenError] = useState('')

  useEffect(() => {
    if (!token) {
      setTokenError('Token de invitación no proporcionado')
      setLoading(false)
      return
    }

    async function validateToken() {
      try {
        const res = await fetch(`${API_URL}/invitations/accept/${token}`)
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string }
          setTokenError(data.message || 'Invitación inválida')
          return
        }
        const data = (await res.json()) as { email: string; role: string }
        setEmail(data.email)
        setRole(data.role)
      } catch {
        setTokenError('Error de conexión con el servidor')
      } finally {
        setLoading(false)
      }
    }
    validateToken()
  }, [token])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!password) {
      setError('La contraseña es requerida')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/invitations/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        setError(data.message || 'Error al activar cuenta')
        return
      }

      router.push('/login')
    } catch {
      setError('Error de conexión con el servidor')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Validando invitación...</p>
      </main>
    )
  }

  if (tokenError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
          <h1 className="mb-4 text-center text-xl font-bold text-gray-900">
            Invitación Inválida
          </h1>
          <p className="text-center text-sm text-red-600">{tokenError}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">
          Activar Cuenta
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          {email} &middot; {role}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirmar Contraseña
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Activando...' : 'Activar Cuenta'}
          </button>
        </form>
      </div>
    </main>
  )
}
