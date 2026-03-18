'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Message {
  id: string
  role: 'CUSTOMER' | 'AGENT'
  content: string
  orderIndex: number
}

interface Finding {
  id: string
  type: string
  severity: 'WARNING' | 'CRITICAL'
  description: string
  evidence: string | null
}

interface Pattern {
  id: string
  name: string
  isEmergent: boolean
  explanation: string | null
  evidence: string | null
}

interface Evaluation {
  id: string
  score: number | null
  label: string | null
  integrityFindings: any
  qualitySubScores: any
  patternClassifications: any
  consolidatorExplanation: string | null
  findings: Finding[]
  patterns: Pattern[]
}

interface ConversationDetail {
  id: string
  runId: string
  sessionId: string
  conversationDate: string
  messageCount: number
  status: string
  notEvaluableReason: string | null
  messages: Message[]
  evaluation: Evaluation | null
  snapshot: { id: string; data: any } | null
}

export default function ConversationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const runId = params.runId as string
  const conversationId = params.conversationId as string

  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [isShared, setIsShared] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      if (!res.ok) router.push('/login')
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    async function fetchConversation() {
      setLoading(true)
      try {
        const res = await fetch(`${API_URL}/conversations/${conversationId}`, {
          credentials: 'include',
        })
        if (res.ok) {
          setConversation((await res.json()) as ConversationDetail)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchConversation()
  }, [conversationId])

  const handleShare = async () => {
    setSharing(true)
    try {
      const res = await fetch(`${API_URL}/sharing/conversations/${conversationId}`, {
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Conversacion no encontrada</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Navigation */}
      <nav className="border-b bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-gray-900">Sistema de Evaluacion</h1>
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            Dashboard
          </Link>
          <Link href="/runs" className="text-sm text-blue-600 hover:underline">
            Runs
          </Link>
          <Link href={`/runs/${runId}`} className="text-sm text-blue-600 hover:underline">
            Detalle Run
          </Link>
        </div>
      </nav>

      {/* Header */}
      <div className="border-b bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Sesion: {conversation.sessionId}
              </h2>
              {isShared && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                  Compartido
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {new Date(conversation.conversationDate).toLocaleString('es-CO')} |{' '}
              {conversation.messageCount} mensajes
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isShared && (
              <button
                onClick={handleShare}
                disabled={sharing}
                className="rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {sharing ? 'Compartiendo...' : 'Compartir con Yalo'}
              </button>
            )}
            <ConversationStatusBadge status={conversation.status} />
          </div>
        </div>
      </div>

      {/* Split Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: WhatsApp-style conversation */}
        <div className="flex w-1/2 flex-col border-r">
          <div className="flex-1 overflow-y-auto bg-[#e5ddd5] p-4">
            <div
              className="mx-auto max-w-lg space-y-2"
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'a\' patternUnits=\'userSpaceOnUse\' width=\'40\' height=\'40\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'1\' fill=\'%23d4cfc4\' opacity=\'.3\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect fill=\'url(%23a)\' width=\'200\' height=\'200\'/%3E%3C/svg%3E")',
              }}
            >
              {conversation.messages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Evaluation Panel */}
        <div className="w-1/2 overflow-y-auto bg-white p-6">
          {conversation.status === 'NOT_EVALUABLE' && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold text-gray-700">No Evaluable</h3>
              <p className="mt-1 text-sm text-gray-500">
                {conversation.notEvaluableReason || 'Sin razon especificada'}
              </p>
            </div>
          )}

          {conversation.evaluation ? (
            <EvaluationPanel evaluation={conversation.evaluation} />
          ) : conversation.status !== 'NOT_EVALUABLE' ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
              <p className="text-gray-500">
                {conversation.status === 'PENDING' || conversation.status === 'EVALUATING'
                  ? 'Evaluacion en proceso...'
                  : 'Sin evaluacion disponible'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ message }: { message: Message }) {
  const isCustomer = message.role === 'CUSTOMER'

  return (
    <div className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`relative max-w-[80%] rounded-lg px-3 py-2 text-sm shadow ${
          isCustomer
            ? 'rounded-tl-none bg-white text-gray-900'
            : 'rounded-tr-none bg-[#dcf8c6] text-gray-900'
        }`}
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {isCustomer ? 'Cliente' : 'Agente'}
        </p>
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
        {/* Tail */}
        {isCustomer ? (
          <div
            className="absolute -left-2 top-0 h-0 w-0"
            style={{
              borderTop: '8px solid white',
              borderLeft: '8px solid transparent',
            }}
          />
        ) : (
          <div
            className="absolute -right-2 top-0 h-0 w-0"
            style={{
              borderTop: '8px solid #dcf8c6',
              borderRight: '8px solid transparent',
            }}
          />
        )}
      </div>
    </div>
  )
}

function EvaluationPanel({ evaluation }: { evaluation: Evaluation }) {
  const labelStyles: Record<string, string> = {
    APROBADA: 'bg-green-100 text-green-800 border-green-300',
    CON_HALLAZGOS: 'bg-amber-100 text-amber-800 border-amber-300',
    FALLIDA: 'bg-red-100 text-red-800 border-red-300',
  }

  const labelNames: Record<string, string> = {
    APROBADA: 'Aprobada',
    CON_HALLAZGOS: 'Con Hallazgos',
    FALLIDA: 'Fallida',
  }

  return (
    <div className="space-y-6">
      {/* Score + Label */}
      <div
        className={`rounded-lg border p-4 ${evaluation.label ? labelStyles[evaluation.label] || 'bg-gray-50 border-gray-200' : 'bg-gray-50 border-gray-200'}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Resultado Final</h3>
            {evaluation.label && (
              <span className="text-xl font-bold">
                {labelNames[evaluation.label] || evaluation.label}
              </span>
            )}
          </div>
          {evaluation.score !== null && (
            <div className="text-right">
              <p className="text-sm text-gray-500">Score</p>
              <p className="text-3xl font-bold">{(evaluation.score * 100).toFixed(1)}%</p>
            </div>
          )}
        </div>
      </div>

      {/* Integrity Section */}
      {evaluation.findings.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-base font-semibold text-gray-900">Integridad</h3>
          <div className="space-y-2">
            {evaluation.findings.map((finding) => (
              <div
                key={finding.id}
                className="rounded border-l-4 bg-gray-50 p-3"
                style={{
                  borderLeftColor:
                    finding.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                }}
              >
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={finding.severity} />
                  <span className="text-sm font-medium text-gray-800">{finding.type}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{finding.description}</p>
                {finding.evidence && (
                  <p className="mt-1 text-xs italic text-gray-400">
                    Evidencia: {finding.evidence}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quality Section */}
      {evaluation.qualitySubScores && (
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-base font-semibold text-gray-900">Calidad</h3>
          <QualityScores subScores={evaluation.qualitySubScores} />
        </div>
      )}

      {/* Patterns Section */}
      {evaluation.patterns.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-base font-semibold text-gray-900">Patrones</h3>
          <div className="space-y-2">
            {evaluation.patterns.map((pattern) => (
              <div key={pattern.id} className="flex items-start gap-2 rounded bg-gray-50 p-3">
                <span className="text-sm font-medium text-gray-800">{pattern.name}</span>
                {pattern.isEmergent && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                    Emergente
                  </span>
                )}
                {pattern.explanation && (
                  <p className="ml-auto text-xs text-gray-500">{pattern.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Consolidator Explanation */}
      {evaluation.consolidatorExplanation && (
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-2 text-base font-semibold text-gray-900">Explicacion del Consolidador</h3>
          <p className="text-sm leading-relaxed text-gray-700">
            {evaluation.consolidatorExplanation}
          </p>
        </div>
      )}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: 'WARNING' | 'CRITICAL' }) {
  if (severity === 'CRITICAL') {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
        Critico
      </span>
    )
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
      Advertencia
    </span>
  )
}

function QualityScores({ subScores }: { subScores: any }) {
  if (!subScores || typeof subScores !== 'object') return null

  const scoreEntries = Object.entries(subScores)

  const displayNames: Record<string, string> = {
    understanding: 'Comprension',
    recommendation: 'Recomendacion',
    fluency: 'Fluidez',
    overall: 'General',
  }

  return (
    <div className="space-y-3">
      {scoreEntries.map(([key, value]) => {
        const numVal = typeof value === 'number' ? value : 0
        return (
          <div key={key}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{displayNames[key] || key}</span>
              <span className="font-medium text-gray-900">
                {(numVal * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${
                  numVal >= 0.7
                    ? 'bg-green-500'
                    : numVal >= 0.4
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${numVal * 100}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
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
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}
    >
      {status}
    </span>
  )
}
