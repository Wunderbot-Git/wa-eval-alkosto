'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import NavBar from '../../../../components/NavBar'

const API_URL = '/api'

interface Message {
  id: string
  role: 'CUSTOMER' | 'AGENT'
  content: string
  orderIndex: number
}

interface Finding {
  id: string
  module?: string
  type: string
  severity: 'WARNING' | 'CRITICAL'
  description: string
  evidence: string | null
  messageIndex?: number | null
}

interface Pattern {
  id: string
  name: string
  isEmergent: boolean
  explanation: string | null
  evidence: string | null
  messageIndex?: number | null
}

interface ExtractedNeeds {
  use_case?: string | null
  budget_min?: number | null
  budget_max?: number | null
  must_have_specs?: string[]
  deal_breakers?: string[]
}

interface Evaluation {
  id: string
  score: number | null
  label: string | null
  integrityFindings: any
  qualitySubScores: any
  patternClassifications: any
  recommendationFindings: any
  recommendationSummary: string | null
  extractedNeeds: ExtractedNeeds | null
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
  const [user, setUser] = useState<{ email: string; role: string } | null>(null)

  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map())

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

  const scrollToMessage = useCallback((messageIndex: number) => {
    const el = messageRefs.current.get(messageIndex)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Add highlight flash animation
      el.classList.remove('highlight-flash')
      // Force reflow to restart animation
      void el.offsetWidth
      el.classList.add('highlight-flash')
    }
  }, [])

  const setMessageRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      messageRefs.current.set(index, el)
    } else {
      messageRefs.current.delete(index)
    }
  }, [])

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
      {/* Highlight flash animation */}
      <style>{`
        @keyframes highlightFlash {
          0% { background-color: rgba(250, 204, 21, 0.5); }
          100% { background-color: transparent; }
        }
        .highlight-flash {
          animation: highlightFlash 1.5s ease-out forwards;
          border-radius: 0.5rem;
        }
      `}</style>

      {/* Navigation */}
      <NavBar userEmail={user?.email} userRole={user?.role} onLogout={handleLogout} />

      {/* Header */}
      <div className="border-b bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link href={`/runs/${runId}`} className="text-sm text-blue-600 hover:underline">
                &larr; Detalle Run
              </Link>
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
                <div
                  key={msg.id}
                  ref={(el) => setMessageRef(msg.orderIndex, el)}
                  data-message-index={msg.orderIndex}
                >
                  <ChatBubble message={msg} />
                </div>
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
            <EvaluationPanel
              evaluation={conversation.evaluation}
              onScrollToMessage={scrollToMessage}
            />
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

function EvaluationPanel({
  evaluation,
  onScrollToMessage,
}: {
  evaluation: Evaluation
  onScrollToMessage: (index: number) => void
}) {
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
      {(() => {
        const integrityFindings = evaluation.findings.filter(
          (f) => (f.module || 'integrity') === 'integrity',
        )
        const recommendationFindings = evaluation.findings.filter(
          (f) => f.module === 'recommendation',
        )
        return (
          <>
            {integrityFindings.length > 0 && (
              <div className="rounded-lg border border-gray-200 p-4">
                <h3 className="mb-3 text-base font-semibold text-gray-900">Integridad</h3>
                <FindingList findings={integrityFindings} onScrollToMessage={onScrollToMessage} />
              </div>
            )}

            {(recommendationFindings.length > 0 || evaluation.recommendationSummary) && (
              <div className="rounded-lg border border-gray-200 p-4">
                <h3 className="mb-3 text-base font-semibold text-gray-900">Recomendación</h3>
                {evaluation.recommendationSummary && (
                  <p className="mb-3 text-sm leading-relaxed text-gray-700">
                    {evaluation.recommendationSummary}
                  </p>
                )}
                {evaluation.extractedNeeds && (
                  <ExtractedNeedsBlock needs={evaluation.extractedNeeds} />
                )}
                {recommendationFindings.length > 0 && (
                  <FindingList findings={recommendationFindings} onScrollToMessage={onScrollToMessage} />
                )}
              </div>
            )}
          </>
        )
      })()}

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
              <div
                key={pattern.id}
                className={`flex items-start gap-2 rounded bg-gray-50 p-3 ${
                  pattern.messageIndex != null ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''
                }`}
                onClick={() => {
                  if (pattern.messageIndex != null) {
                    onScrollToMessage(pattern.messageIndex)
                  }
                }}
              >
                <span className="text-sm font-medium text-gray-800">{pattern.name}</span>
                {pattern.isEmergent && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                    Emergente
                  </span>
                )}
                {pattern.messageIndex != null && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                    Msg #{pattern.messageIndex}
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

function FindingList({
  findings,
  onScrollToMessage,
}: {
  findings: Finding[]
  onScrollToMessage: (index: number) => void
}) {
  return (
    <div className="space-y-2">
      {findings.map((finding) => (
        <div
          key={finding.id}
          className={`rounded border-l-4 bg-gray-50 p-3 ${
            finding.messageIndex != null ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''
          }`}
          style={{
            borderLeftColor: finding.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b',
          }}
          onClick={() => {
            if (finding.messageIndex != null) {
              onScrollToMessage(finding.messageIndex)
            }
          }}
        >
          <div className="flex items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <span className="text-sm font-medium text-gray-800">{finding.type}</span>
            {finding.messageIndex != null && (
              <span className="ml-auto rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                Msg #{finding.messageIndex}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600">{finding.description}</p>
          {finding.evidence && (
            <p className="mt-1 text-xs italic text-gray-400">Evidencia: {finding.evidence}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function ExtractedNeedsBlock({ needs }: { needs: ExtractedNeeds }) {
  const hasAnything =
    needs.use_case ||
    needs.budget_min != null ||
    needs.budget_max != null ||
    (needs.must_have_specs && needs.must_have_specs.length > 0) ||
    (needs.deal_breakers && needs.deal_breakers.length > 0)
  if (!hasAnything) return null

  const fmtBudget = () => {
    if (needs.budget_min == null && needs.budget_max == null) return null
    const min = needs.budget_min != null ? needs.budget_min.toLocaleString('es-CO') : '?'
    const max = needs.budget_max != null ? needs.budget_max.toLocaleString('es-CO') : '?'
    return `$${min} – $${max} COP`
  }
  const budget = fmtBudget()

  return (
    <div className="mb-3 rounded bg-blue-50 p-3 text-xs text-gray-700">
      <p className="mb-1 font-semibold uppercase tracking-wide text-blue-700">
        Necesidades del cliente
      </p>
      {needs.use_case && (
        <p>
          <span className="font-medium">Uso:</span> {needs.use_case}
        </p>
      )}
      {budget && (
        <p>
          <span className="font-medium">Presupuesto:</span> {budget}
        </p>
      )}
      {needs.must_have_specs && needs.must_have_specs.length > 0 && (
        <p>
          <span className="font-medium">Requisitos:</span> {needs.must_have_specs.join(', ')}
        </p>
      )}
      {needs.deal_breakers && needs.deal_breakers.length > 0 && (
        <p>
          <span className="font-medium">Excluye:</span> {needs.deal_breakers.join(', ')}
        </p>
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
