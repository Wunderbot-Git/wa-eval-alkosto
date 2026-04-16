'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '../components/NavBar'

const API_URL = '/api'

interface User {
  id: string
  email: string
  role: string
}

interface UploadResult {
  id: string
  name: string
  status: string
  totalConversations: number
  validCount: number
  notEvaluableCount: number
  createdAt: string
}

export default function UploadPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
      } catch {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router])

  async function handleLogout() {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
    router.push('/login')
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage(null)
    setUploadResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_URL}/runs/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (res.ok) {
        const data = (await res.json()) as UploadResult
        setUploadResult(data)
        setMessage({
          type: 'success',
          text: `Run "${data.name}" creado con ${data.validCount} conversaciones validas y ${data.notEvaluableCount} no evaluables.`,
        })
      } else {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        setMessage({ type: 'error', text: data.message || 'Error al subir las conversaciones.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexion con el servidor.' })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleLaunch() {
    if (!uploadResult) return

    setLaunching(true)
    try {
      const res = await fetch(`${API_URL}/runs/${uploadResult.id}/launch`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        router.push(`/runs/${uploadResult.id}`)
      } else {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        setMessage({ type: 'error', text: data.message || 'Error al lanzar la evaluacion.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexion con el servidor.' })
    } finally {
      setLaunching(false)
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

      <main className="mx-auto max-w-3xl p-6">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">Subir Conversaciones</h2>

        <div className="rounded-lg bg-white p-6 shadow">
          <p className="mb-4 text-sm text-gray-600">
            Selecciona un archivo JSON con el lote de conversaciones para evaluar.
          </p>

          <label className={`inline-block cursor-pointer rounded px-4 py-2 text-sm font-medium text-white ${uploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {uploading ? 'Subiendo...' : 'Seleccionar Archivo JSON'}
            <input
              type="file"
              accept=".json"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {message && (
          <div
            className={`mt-4 rounded-lg p-4 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {uploadResult && (
          <div className="mt-6 rounded-lg bg-white p-6 shadow">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">Run Creado</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Nombre:</span>
                <span className="font-medium text-gray-900">{uploadResult.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total conversaciones:</span>
                <span className="font-medium text-gray-900">{uploadResult.totalConversations}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Validas:</span>
                <span className="font-medium text-green-700">{uploadResult.validCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">No evaluables:</span>
                <span className="font-medium text-amber-700">{uploadResult.notEvaluableCount}</span>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleLaunch}
                disabled={launching}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {launching ? 'Lanzando...' : 'Lanzar Evaluacion'}
              </button>
              <Link
                href={`/runs/${uploadResult.id}`}
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Ver Run
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
