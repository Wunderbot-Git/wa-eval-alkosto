'use client'

import { useState, FormEvent } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'INTERNAL_ALKOSTO', label: 'Internal Alkosto' },
  { value: 'YALO_READER', label: 'Yalo Reader' },
]

export default function AdminInvitePage() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('INTERNAL_ALKOSTO')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteLink, setInviteLink] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInviteLink('')

    if (!email.trim()) {
      setError('El correo es requerido')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), role }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        setError(data.message || 'Error al crear invitación')
        return
      }

      const data = (await res.json()) as { inviteLink: string }
      setInviteLink(data.inviteLink)
      setEmail('')
    } catch {
      setError('Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-gray-900">Invitar Usuario</h2>

      <div className="max-w-md rounded-lg border bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="usuario@ejemplo.com"
            />
          </div>
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700">
              Rol
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole((e.target as HTMLSelectElement).value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creando...' : 'Crear Invitación'}
          </button>
        </form>

        {inviteLink && (
          <div className="mt-4 rounded bg-green-50 p-4">
            <p className="mb-2 text-sm font-medium text-green-800">
              Invitación creada exitosamente
            </p>
            <p className="break-all text-xs text-green-700">{inviteLink}</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteLink)
              }}
              className="mt-2 rounded bg-green-200 px-3 py-1 text-xs text-green-800 hover:bg-green-300"
            >
              Copiar enlace
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
