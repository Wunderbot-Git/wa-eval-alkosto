'use client'

import { useEffect, useState } from 'react'

const API_URL = '/api'

interface User {
  id: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  async function fetchUsers() {
    try {
      const res = await fetch(`${API_URL}/users`, { credentials: 'include' })
      if (!res.ok) throw new Error('Error al cargar usuarios')
      const data = (await res.json()) as User[]
      setUsers(data)
    } catch {
      setError('Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  async function handleDeactivate(id: string) {
    if (!confirm('¿Desactivar este usuario?')) return
    setActionMessage('')
    try {
      const res = await fetch(`${API_URL}/users/${id}/deactivate`, {
        method: 'PATCH',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Error al desactivar')
      setActionMessage('Usuario desactivado')
      fetchUsers()
    } catch {
      setActionMessage('Error al desactivar usuario')
    }
  }

  async function handleChangeRole(id: string, currentRole: string) {
    const roles = ['ADMIN', 'INTERNAL_ALKOSTO', 'YALO_READER']
    const newRole = prompt(
      `Rol actual: ${currentRole}\nIngrese nuevo rol (${roles.join(', ')}):`,
    )
    if (!newRole || !roles.includes(newRole)) return
    setActionMessage('')
    try {
      const res = await fetch(`${API_URL}/users/${id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) throw new Error('Error al cambiar rol')
      setActionMessage('Rol actualizado')
      fetchUsers()
    } catch {
      setActionMessage('Error al cambiar rol')
    }
  }

  async function handleResetPassword(id: string) {
    if (!confirm('¿Resetear la contraseña de este usuario?')) return
    setActionMessage('')
    try {
      const res = await fetch(`${API_URL}/users/${id}/reset-password`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Error al resetear')
      const data = (await res.json()) as { tempPassword: string }
      setActionMessage(`Contraseña temporal: ${data.tempPassword}`)
    } catch {
      setActionMessage('Error al resetear contraseña')
    }
  }

  if (loading) {
    return <p className="text-gray-500">Cargando usuarios...</p>
  }

  if (error) {
    return <p className="text-red-600">{error}</p>
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-gray-900">Gestión de Usuarios</h2>

      {actionMessage && (
        <div className="mb-4 rounded bg-blue-50 p-3 text-sm text-blue-800">
          {actionMessage}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Creado</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b last:border-0">
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium">
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      user.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {user.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString('es-CO')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleChangeRole(user.id, user.role)}
                      className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200"
                    >
                      Cambiar Rol
                    </button>
                    <button
                      onClick={() => handleResetPassword(user.id)}
                      className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-700 hover:bg-yellow-200"
                    >
                      Reset Password
                    </button>
                    {user.isActive && (
                      <button
                        onClick={() => handleDeactivate(user.id)}
                        className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                      >
                        Desactivar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
