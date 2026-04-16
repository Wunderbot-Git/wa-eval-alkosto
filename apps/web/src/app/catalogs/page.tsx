'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '../components/NavBar'

const API_URL = '/api'

interface User {
  id: string
  email: string
  role: string
}

interface CatalogItem {
  id: string
  filename: string
  productCount: number
  uploadedBy: string
  createdAt: string
  user?: { email: string }
}

export default function CatalogsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchCatalogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/catalogs`, { credentials: 'include' })
      if (res.ok) {
        setCatalogs((await res.json()) as CatalogItem[])
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' })
        if (!res.ok) {
          router.push('/login')
          return
        }
        const userData = (await res.json()) as User
        if (userData.role !== 'ADMIN' && userData.role !== 'INTERNAL_ALKOSTO') {
          router.push('/dashboard')
          return
        }
        setUser(userData)
        await fetchCatalogs()
      } catch {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router, fetchCatalogs])

  async function handleLogout() {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
    router.push('/login')
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_URL}/catalogs/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (res.ok) {
        setMessage({ type: 'success', text: `Catalogo "${file.name}" subido exitosamente.` })
        await fetchCatalogs()
      } else {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        setMessage({ type: 'error', text: data.message || 'Error al subir el catalogo.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexion con el servidor.' })
    } finally {
      setUploading(false)
      // Reset the input so the same file can be re-uploaded
      e.target.value = ''
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </main>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar userEmail={user.email} userRole={user.role} onLogout={handleLogout} />

      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Catalogos</h2>
          <label className={`cursor-pointer rounded px-4 py-2 text-sm font-medium text-white ${uploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {uploading ? 'Subiendo...' : 'Subir Catalogo'}
            <input
              type="file"
              accept=".json,.csv,.xlsx"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {message && (
          <div
            className={`mb-4 rounded-lg p-4 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {catalogs.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-500">No hay catalogos disponibles.</p>
            <p className="mt-2 text-sm text-gray-400">
              Sube un archivo de catalogo para comenzar.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Archivo</th>
                  <th className="px-4 py-3 text-center">Productos</th>
                  <th className="px-4 py-3">Subido por</th>
                  <th className="px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {catalogs.map((catalog) => (
                  <tr key={catalog.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{catalog.filename}</td>
                    <td className="px-4 py-3 text-center">{catalog.productCount}</td>
                    <td className="px-4 py-3 text-gray-500">{catalog.user?.email || catalog.uploadedBy}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(catalog.createdAt).toLocaleString('es-CO')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
