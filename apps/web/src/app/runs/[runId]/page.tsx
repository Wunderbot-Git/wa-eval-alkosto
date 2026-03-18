'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import NavBar from '../../components/NavBar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface RunSummary {
  run: {
    id: string
    name: string
    status: string
    totalConversations: number
    evaluatedCount: number
    notEvaluableCount: number
    failedCount: number
    aggregateScore: number | null
    expiresAt: string | null
    createdAt: string
  }
  labelDistribution: {
    APROBADA: number
    CON_HALLAZGOS: number
    FALLIDA: number
    NOT_EVALUABLE: number
  }
  topFindings: { type: string; count: number }[]
}

interface ConversationItem {
  id: string
  sessionId: string
  conversationDate: string
  status: string
  messageCount: number
  notEvaluableReason: string | null
  evaluation: {
    score: number | null
    label: string | null
  } | null
}

interface ConversationsResponse {
  data: ConversationItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export default function RunDetailPage() {
  const router = useRouter()
  const params = useParams()
  const runId = params.runId as string

  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [conversations, setConversations] = useState<ConversationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [isShared, setIsShared] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportId, setExportId] = useState<string | null>(null)
  const [reevaluating, setReevaluating] = useState(false)
  const [showReevalModal, setShowReevalModal] = useState(false)
  const [reevalFilters, setReevalFilters] = useState({ status: '', label: '', findingType: '', pattern: '' })
  const [user, setUser] = useState<{ email: string; role: string } | null>(null)

  useEffect(() => {
    async function checkAuth() {
      const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      if (!res.ok) {
        router.push('/login')
        return
      }
      const userData = (await res.json()) as { email: string; role: string }
      setUser(userData)
    }
    checkAuth()
  }, [router])

  async function handleLogout() {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
    router.push('/login')
  }

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await fetch(`${API_URL}/runs/${runId}/summary`, {
          credentials: 'include',
        })
        if (res.ok) setSummary((await res.json()) as RunSummary)
      } catch {
        // ignore
      }
    }
    fetchSummary()
  }, [runId])

  // Check shared status
  useEffect(() => {
    async function checkShared() {
      try {
        const res = await fetch(`${API_URL}/sharing/runs/${runId}/status`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setIsShared(data.shared)
        }
      } catch {
        // ignore
      }
    }
    checkShared()
  }, [runId])

  const fetchConversations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      })
      if (statusFilter) params.set('status', statusFilter)
      if (labelFilter) params.set('label', labelFilter)

      const res = await fetch(`${API_URL}/runs/${runId}/conversations?${params}`, {
        credentials: 'include',
      })
      if (res.ok) setConversations((await res.json()) as ConversationsResponse)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [runId, page, statusFilter, labelFilter])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Poll when PROCESSING
  useEffect(() => {
    if (!summary || summary.run.status !== 'PROCESSING') return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/runs/${runId}/summary`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data = (await res.json()) as RunSummary
          setSummary(data)
          if (data.run.status !== 'PROCESSING') {
            fetchConversations()
          }
        }
      } catch {
        // ignore
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [runId, summary?.run.status, fetchConversations])

  const handleShare = async () => {
    setSharing(true)
    try {
      const res = await fetch(`${API_URL}/sharing/runs/${runId}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        setIsShared(true)
      }
    } catch {
      // ignore
    } finally {
      setSharing(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch(`${API_URL}/exports/runs/${runId}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setExportId(data.id)
      }
    } catch {
      // ignore
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadExport = () => {
    if (exportId) {
      window.open(`${API_URL}/exports/${exportId}/download`, '_blank')
    }
  }

  const handleReevaluate = async () => {
    setReevaluating(true)
    try {
      const filters: Record<string, string> = {}
      if (reevalFilters.status) filters.status = reevalFilters.status
      if (reevalFilters.label) filters.label = reevalFilters.label
      if (reevalFilters.findingType) filters.findingType = reevalFilters.findingType
      if (reevalFilters.pattern) filters.pattern = reevalFilters.pattern

      const res = await fetch(`${API_URL}/runs/${runId}/reevaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setShowReevalModal(false)
        router.push(`/runs/${data.newRunId}`)
      }
    } catch {
      // ignore
    } finally {
      setReevaluating(false)
    }
  }

  if (!summary) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  const { run, labelDistribution, topFindings } = summary
  const total =
    labelDistribution.APROBADA +
    labelDistribution.CON_HALLAZGOS +
    labelDistribution.FALLIDA +
    labelDistribution.NOT_EVALUABLE

  const progress =
    run.totalConversations > 0
      ? Math.round(
          ((run.evaluatedCount + run.notEvaluableCount + run.failedCount) /
            run.totalConversations) *
            100,
        )
      : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar userEmail={user?.email} userRole={user?.role} onLogout={handleLogout} />

      <main className="mx-auto max-w-6xl p-6">
        {/* Run Header */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900">{run.name}</h2>
                {isShared && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                    Compartido
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {new Date(run.createdAt).toLocaleString('es-CO')}
              </p>
              {run.expiresAt && (
                <p className="text-xs text-gray-400">
                  Expira: {new Date(run.expiresAt).toLocaleDateString('es-CO')}
                </p>
              )}
            </div>
            <div className="text-right">
              <StatusBadge status={run.status} />
              {run.aggregateScore !== null && (
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {(run.aggregateScore * 100).toFixed(1)}%
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            {!isShared && (
              <button
                onClick={handleShare}
                disabled={sharing}
                className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {sharing ? 'Compartiendo...' : 'Compartir con Yalo'}
              </button>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {exporting ? 'Exportando...' : 'Exportar JSON'}
            </button>
            {exportId && (
              <button
                onClick={handleDownloadExport}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Descargar Exportacion
              </button>
            )}
            <button
              onClick={() => setShowReevalModal(true)}
              className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Re-evaluar
            </button>
          </div>

          {run.status === 'PROCESSING' && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Progreso</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Label distribution */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox label="Aprobada" count={labelDistribution.APROBADA} color="text-green-700" />
            <StatBox
              label="Con Hallazgos"
              count={labelDistribution.CON_HALLAZGOS}
              color="text-amber-700"
            />
            <StatBox label="Fallida" count={labelDistribution.FALLIDA} color="text-red-700" />
            <StatBox
              label="No Evaluable"
              count={labelDistribution.NOT_EVALUABLE}
              color="text-gray-600"
            />
          </div>

          {total > 0 && (
            <div className="mt-3 flex h-3 overflow-hidden rounded-full">
              {labelDistribution.APROBADA > 0 && (
                <div
                  className="bg-green-500"
                  style={{ width: `${(labelDistribution.APROBADA / total) * 100}%` }}
                />
              )}
              {labelDistribution.CON_HALLAZGOS > 0 && (
                <div
                  className="bg-amber-500"
                  style={{ width: `${(labelDistribution.CON_HALLAZGOS / total) * 100}%` }}
                />
              )}
              {labelDistribution.FALLIDA > 0 && (
                <div
                  className="bg-red-500"
                  style={{ width: `${(labelDistribution.FALLIDA / total) * 100}%` }}
                />
              )}
              {labelDistribution.NOT_EVALUABLE > 0 && (
                <div
                  className="bg-gray-400"
                  style={{ width: `${(labelDistribution.NOT_EVALUABLE / total) * 100}%` }}
                />
              )}
            </div>
          )}
        </div>

        {/* Top Findings */}
        {topFindings.length > 0 && (
          <div className="mb-6 rounded-lg bg-white p-6 shadow">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">Hallazgos Principales</h3>
            <div className="space-y-2">
              {topFindings.map((f) => (
                <div key={f.type} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{f.type}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {f.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="EVALUATING">Evaluando</option>
            <option value="EVALUATED">Evaluada</option>
            <option value="NOT_EVALUABLE">No Evaluable</option>
            <option value="FAILED">Fallida</option>
          </select>
          <select
            value={labelFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setLabelFilter(e.target.value)
              setPage(1)
            }}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Todas las etiquetas</option>
            <option value="APROBADA">Aprobada</option>
            <option value="CON_HALLAZGOS">Con Hallazgos</option>
            <option value="FALLIDA">Fallida</option>
          </select>
        </div>

        {/* Conversations Table */}
        {loading ? (
          <p className="text-gray-500">Cargando conversaciones...</p>
        ) : !conversations || conversations.data.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-500">No se encontraron conversaciones.</p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Session ID</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-center">Mensajes</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3">Etiqueta</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {conversations.data.map((conv) => (
                    <tr
                      key={conv.id}
                      onClick={() =>
                        router.push(`/runs/${runId}/conversations/${conv.id}`)
                      }
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {conv.sessionId}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(conv.conversationDate).toLocaleDateString('es-CO')}
                      </td>
                      <td className="px-4 py-3">
                        <ConversationStatusBadge status={conv.status} />
                      </td>
                      <td className="px-4 py-3 text-center">{conv.messageCount}</td>
                      <td className="px-4 py-3 text-center">
                        {conv.evaluation?.score !== null && conv.evaluation?.score !== undefined
                          ? `${(conv.evaluation.score * 100).toFixed(1)}%`
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {conv.evaluation?.label ? (
                          <LabelBadge label={conv.evaluation.label} />
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {conversations.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Pagina {conversations.page} de {conversations.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(conversations.totalPages, p + 1))}
                  disabled={page >= conversations.totalPages}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}

        {/* Re-evaluation Modal */}
        {showReevalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Re-evaluar Run</h3>
              <p className="mb-4 text-sm text-gray-600">
                Filtros opcionales para seleccionar conversaciones:
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Estado</label>
                  <select
                    value={reevalFilters.status}
                    onChange={(e) => setReevalFilters((f) => ({ ...f, status: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                  >
                    <option value="">Todos</option>
                    <option value="EVALUATED">Evaluada</option>
                    <option value="FAILED">Fallida</option>
                    <option value="NOT_EVALUABLE">No Evaluable</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Etiqueta</label>
                  <select
                    value={reevalFilters.label}
                    onChange={(e) => setReevalFilters((f) => ({ ...f, label: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                  >
                    <option value="">Todas</option>
                    <option value="APROBADA">Aprobada</option>
                    <option value="CON_HALLAZGOS">Con Hallazgos</option>
                    <option value="FALLIDA">Fallida</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Tipo de Hallazgo</label>
                  <input
                    type="text"
                    value={reevalFilters.findingType}
                    onChange={(e) => setReevalFilters((f) => ({ ...f, findingType: e.target.value }))}
                    placeholder="ej. wrong_price"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Patron</label>
                  <input
                    type="text"
                    value={reevalFilters.pattern}
                    onChange={(e) => setReevalFilters((f) => ({ ...f, pattern: e.target.value }))}
                    placeholder="ej. greeting"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowReevalModal(false)}
                  className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReevaluate}
                  disabled={reevaluating}
                  className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {reevaluating ? 'Re-evaluando...' : 'Re-evaluar'}
                </button>
              </div>
            </div>
          </div>
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
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}
    >
      {status}
    </span>
  )
}

function ConversationStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-gray-100 text-gray-600',
    EVALUATING: 'bg-blue-100 text-blue-600',
    EVALUATED: 'bg-green-100 text-green-600',
    NOT_EVALUABLE: 'bg-gray-100 text-gray-500',
    FAILED: 'bg-red-100 text-red-600',
  }
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}
    >
      {status}
    </span>
  )
}

function LabelBadge({ label }: { label: string }) {
  const styles: Record<string, string> = {
    APROBADA: 'bg-green-100 text-green-700',
    CON_HALLAZGOS: 'bg-amber-100 text-amber-700',
    FALLIDA: 'bg-red-100 text-red-700',
  }
  const displayNames: Record<string, string> = {
    APROBADA: 'Aprobada',
    CON_HALLAZGOS: 'Con Hallazgos',
    FALLIDA: 'Fallida',
  }
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[label] || 'bg-gray-100 text-gray-700'}`}
    >
      {displayNames[label] || label}
    </span>
  )
}

function StatBox({
  label,
  count,
  color,
}: {
  label: string
  count: number
  color: string
}) {
  return (
    <div className="rounded border p-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{count}</p>
    </div>
  )
}
