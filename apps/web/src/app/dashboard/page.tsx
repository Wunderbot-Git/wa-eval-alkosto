'use client'

import { useEffect, useState, useCallback } from 'react'
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

interface RunData {
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
}

interface User {
  id: string
  email: string
  role: string
}

interface ComparisonRunSummary {
  score: number | null
  aprobadas: number
  conHallazgos: number
  fallidas: number
  total: number
}

interface ComparisonData {
  current: ComparisonRunSummary
  previous: ComparisonRunSummary | null
  deltas: {
    score: number | null
    aprobadas: number
    conHallazgos: number
    fallidas: number
  } | null
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [latestRun, setLatestRun] = useState<RunData | null>(null)
  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchLatestRun = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/runs/latest`, { credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as RunData
        setLatestRun(data)
        return data
      }
    } catch {
      // ignore
    }
    return null
  }, [])

  const fetchComparison = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`${API_URL}/runs/${runId}/comparison`, { credentials: 'include' })
      if (res.ok) {
        setComparison((await res.json()) as ComparisonData)
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
        setUser(userData)
        const run = await fetchLatestRun()
        if (run) {
          await fetchComparison(run.id)
        }
      } catch {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router, fetchLatestRun, fetchComparison])

  // Poll for progress if run is PROCESSING
  useEffect(() => {
    if (!latestRun || latestRun.status !== 'PROCESSING') return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/runs/${latestRun.id}/status`, {
          credentials: 'include',
        })
        if (res.ok) {
          const statusData = (await res.json()) as Partial<RunData>
          setLatestRun((prev) =>
            prev ? { ...prev, ...statusData } : prev,
          )
          if (statusData.status !== 'PROCESSING') {
            const run = await fetchLatestRun()
            if (run) {
              await fetchComparison(run.id)
            }
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [latestRun?.id, latestRun?.status, fetchLatestRun, fetchComparison])

  async function handleLogout() {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    router.push('/login')
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </main>
    )
  }

  if (!user) return null

  const isAdmin = user.role === 'ADMIN' || user.role === 'INTERNAL_ALKOSTO'

  const total = latestRun
    ? (latestRun.labelDistribution.APROBADA +
        latestRun.labelDistribution.CON_HALLAZGOS +
        latestRun.labelDistribution.FALLIDA +
        latestRun.labelDistribution.NOT_EVALUABLE)
    : 0

  const progress = latestRun
    ? latestRun.totalConversations > 0
      ? Math.round(
          ((latestRun.evaluatedCount + latestRun.notEvaluableCount + latestRun.failedCount) /
            latestRun.totalConversations) *
            100,
        )
      : 0
    : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar userEmail={user.email} userRole={user.role} onLogout={handleLogout} />

      <main className="mx-auto max-w-5xl p-6">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h2>

        {!latestRun ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-500">No hay runs disponibles.</p>
            <p className="mt-2 text-sm text-gray-400">
              Sube un archivo de conversaciones para comenzar.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Latest Run Summary */}
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Ultimo Run</h3>
                  <p className="text-sm text-gray-500">{latestRun.name}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(latestRun.createdAt).toLocaleString('es-CO')}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={latestRun.status} />
                  {latestRun.aggregateScore !== null && (
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {latestRun.aggregateScore.toFixed(1)}/10
                    </p>
                  )}
                </div>
              </div>

              {/* Progress bar when processing */}
              {latestRun.status === 'PROCESSING' && (
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
                  <p className="mt-1 text-xs text-gray-400">
                    {latestRun.evaluatedCount + latestRun.notEvaluableCount + latestRun.failedCount}{' '}
                    / {latestRun.totalConversations} conversaciones procesadas
                  </p>
                </div>
              )}
            </div>

            {/* Score Distribution */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Distribucion de Resultados</h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <ScoreCard
                  label="Aprobada"
                  count={latestRun.labelDistribution.APROBADA}
                  total={total}
                  color="bg-green-500"
                  textColor="text-green-700"
                />
                <ScoreCard
                  label="Con Hallazgos"
                  count={latestRun.labelDistribution.CON_HALLAZGOS}
                  total={total}
                  color="bg-amber-500"
                  textColor="text-amber-700"
                />
                <ScoreCard
                  label="Fallida"
                  count={latestRun.labelDistribution.FALLIDA}
                  total={total}
                  color="bg-red-500"
                  textColor="text-red-700"
                />
                <ScoreCard
                  label="No Evaluable"
                  count={latestRun.labelDistribution.NOT_EVALUABLE}
                  total={total}
                  color="bg-gray-400"
                  textColor="text-gray-600"
                />
              </div>

              {/* Distribution bar */}
              {total > 0 && (
                <div className="mt-4 flex h-4 overflow-hidden rounded-full">
                  {latestRun.labelDistribution.APROBADA > 0 && (
                    <div
                      className="bg-green-500"
                      style={{
                        width: `${(latestRun.labelDistribution.APROBADA / total) * 100}%`,
                      }}
                    />
                  )}
                  {latestRun.labelDistribution.CON_HALLAZGOS > 0 && (
                    <div
                      className="bg-amber-500"
                      style={{
                        width: `${(latestRun.labelDistribution.CON_HALLAZGOS / total) * 100}%`,
                      }}
                    />
                  )}
                  {latestRun.labelDistribution.FALLIDA > 0 && (
                    <div
                      className="bg-red-500"
                      style={{
                        width: `${(latestRun.labelDistribution.FALLIDA / total) * 100}%`,
                      }}
                    />
                  )}
                  {latestRun.labelDistribution.NOT_EVALUABLE > 0 && (
                    <div
                      className="bg-gray-400"
                      style={{
                        width: `${(latestRun.labelDistribution.NOT_EVALUABLE / total) * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Comparison vs. Previous Run */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Comparacion vs. Run Anterior</h3>
              {!comparison || !comparison.previous ? (
                <p className="text-sm text-gray-500">No hay run anterior para comparar.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <DeltaCard
                    label="Score"
                    delta={comparison.deltas!.score}
                    format="percent"
                  />
                  <DeltaCard
                    label="Aprobadas"
                    delta={comparison.deltas!.aprobadas}
                    format="count"
                    positive="up"
                  />
                  <DeltaCard
                    label="Con Hallazgos"
                    delta={comparison.deltas!.conHallazgos}
                    format="count"
                    positive="down"
                  />
                  <DeltaCard
                    label="Fallidas"
                    delta={comparison.deltas!.fallidas}
                    format="count"
                    positive="down"
                  />
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                href={`/runs/${latestRun.id}`}
                className="rounded-lg bg-white p-4 shadow transition hover:shadow-md"
              >
                <h4 className="font-medium text-gray-900">Ver Detalle del Run</h4>
                <p className="text-sm text-gray-500">Explorar conversaciones y resultados</p>
              </Link>
              <Link
                href="/runs"
                className="rounded-lg bg-white p-4 shadow transition hover:shadow-md"
              >
                <h4 className="font-medium text-gray-900">Historial de Runs</h4>
                <p className="text-sm text-gray-500">Ver todos los runs anteriores</p>
              </Link>
              {isAdmin && (
                <>
                  <Link
                    href="/catalogs"
                    className="rounded-lg bg-white p-4 shadow transition hover:shadow-md"
                  >
                    <h4 className="font-medium text-gray-900">Subir Catalogo</h4>
                    <p className="text-sm text-gray-500">Gestionar catalogos de productos</p>
                  </Link>
                  <Link
                    href="/upload"
                    className="rounded-lg bg-white p-4 shadow transition hover:shadow-md"
                  >
                    <h4 className="font-medium text-gray-900">Subir Conversaciones</h4>
                    <p className="text-sm text-gray-500">Cargar nuevas conversaciones</p>
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function DeltaCard({
  label,
  delta,
  format,
  positive = 'up',
}: {
  label: string
  delta: number | null
  format: 'percent' | 'count'
  positive?: 'up' | 'down'
}) {
  if (delta === null) {
    return (
      <div className="rounded-lg border p-4">
        <span className="text-sm text-gray-600">{label}</span>
        <p className="mt-2 text-lg font-bold text-gray-400">-</p>
      </div>
    )
  }

  const isPositive = positive === 'up' ? delta > 0 : delta < 0
  const isNegative = positive === 'up' ? delta < 0 : delta > 0
  const arrow = delta > 0 ? '\u2191' : delta < 0 ? '\u2193' : ''
  const colorClass = isPositive
    ? 'text-green-700'
    : isNegative
      ? 'text-red-700'
      : 'text-gray-600'
  const bgClass = isPositive
    ? 'bg-green-50 border-green-200'
    : isNegative
      ? 'bg-red-50 border-red-200'
      : 'border-gray-200'

  const displayValue =
    format === 'percent'
      ? `${arrow} ${(Math.abs(delta) * 100).toFixed(1)}%`
      : `${arrow} ${Math.abs(delta)}`

  return (
    <div className={`rounded-lg border p-4 ${bgClass}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <p className={`mt-2 text-lg font-bold ${colorClass}`}>
        {delta === 0 ? '=' : displayValue}
      </p>
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

function ScoreCard({
  label,
  count,
  total,
  color,
  textColor,
}: {
  label: string
  count: number
  total: number
  color: string
  textColor: string
}) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <div className={`h-3 w-3 rounded-full ${color}`} />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${textColor}`}>{count}</p>
      <p className="text-xs text-gray-400">{pct}%</p>
    </div>
  )
}
