'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '../components/NavBar'

const API_URL = '/api'

interface LabelDistribution {
  APROBADA: number
  CON_HALLAZGOS: number
  FALLIDA: number
  NOT_EVALUABLE: number
}

interface RunItem {
  id: string
  name: string
  status: string
  totalConversations: number
  evaluatedCount: number
  notEvaluableCount: number
  failedCount: number
  aggregateScore: number | null
  createdAt: string
  labelDistribution: LabelDistribution
  isShared?: boolean
}

interface RunsResponse {
  data: RunItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export default function RunsPage() {
  const router = useRouter()
  const [runs, setRuns] = useState<RunsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [user, setUser] = useState<{ email: string; role: string } | null>(null)

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' })
        if (!res.ok) {
          router.push('/login')
          return
        }
        const userData = (await res.json()) as { email: string; role: string }
        setUser(userData)
      } catch {
        router.push('/login')
        return
      }
    }
    checkAuth()
  }, [router])

  async function handleLogout() {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
    router.push('/login')
  }

  useEffect(() => {
    async function fetchRuns() {
      setLoading(true)
      try {
        const res = await fetch(`${API_URL}/runs?page=${page}&limit=20`, {
          credentials: 'include',
        })
        if (res.ok) {
          setRuns((await res.json()) as RunsResponse)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchRuns()
  }, [page])

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar userEmail={user?.email} userRole={user?.role} onLogout={handleLogout} />

      <main className="mx-auto max-w-6xl p-6">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">Historial de Runs</h2>

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : !runs || runs.data.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-500">No hay runs disponibles.</p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3 text-center">Total</th>
                    <th className="px-4 py-3 text-center">Evaluadas</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3">Distribucion</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {runs.data.map((run) => (
                    <tr
                      key={run.id}
                      onClick={() => router.push(`/runs/${run.id}`)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <span>{run.name}</span>
                        {run.isShared && (
                          <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                            Compartido
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(run.createdAt).toLocaleDateString('es-CO')}
                      </td>
                      <td className="px-4 py-3 text-center">{run.totalConversations}</td>
                      <td className="px-4 py-3 text-center">{run.evaluatedCount}</td>
                      <td className="px-4 py-3 text-center">
                        {run.aggregateScore !== null
                          ? `${run.aggregateScore.toFixed(1)}/10`
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <LabelBar distribution={run.labelDistribution} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {runs.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Pagina {runs.page} de {runs.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(runs.totalPages, p + 1))}
                  disabled={page >= runs.totalPages}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-gray-100 text-gray-700',
    PROCESSING: 'bg-blue-100 text-blue-700',
    COMPLETED: 'bg-green-100 text-green-700',
    COMPLETED_WITH_ERRORS: 'bg-amber-100 text-amber-700',
    CANCELLED: 'bg-red-100 text-red-700',
  }
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}
    >
      {status}
    </span>
  )
}

function LabelBar({ distribution }: { distribution: LabelDistribution }) {
  const total =
    distribution.APROBADA +
    distribution.CON_HALLAZGOS +
    distribution.FALLIDA +
    distribution.NOT_EVALUABLE
  if (total === 0) return <span className="text-xs text-gray-400">-</span>

  return (
    <div className="flex h-2 w-24 overflow-hidden rounded-full">
      {distribution.APROBADA > 0 && (
        <div
          className="bg-green-500"
          style={{ width: `${(distribution.APROBADA / total) * 100}%` }}
        />
      )}
      {distribution.CON_HALLAZGOS > 0 && (
        <div
          className="bg-amber-500"
          style={{ width: `${(distribution.CON_HALLAZGOS / total) * 100}%` }}
        />
      )}
      {distribution.FALLIDA > 0 && (
        <div
          className="bg-red-500"
          style={{ width: `${(distribution.FALLIDA / total) * 100}%` }}
        />
      )}
      {distribution.NOT_EVALUABLE > 0 && (
        <div
          className="bg-gray-400"
          style={{ width: `${(distribution.NOT_EVALUABLE / total) * 100}%` }}
        />
      )}
    </div>
  )
}
