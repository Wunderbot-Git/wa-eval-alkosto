import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ConversationParserService } from '../conversations/conversation-parser.service'
import { randomUUID } from 'crypto'

@Injectable()
export class RunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: ConversationParserService,
  ) {}

  /**
   * Generate a run name: RUN-YYYYMMDD-{shortUUID}
   */
  generateRunName(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const shortId = randomUUID().replace(/-/g, '').slice(0, 6)
    return `RUN-${y}${m}${d}-${shortId}`
  }

  async createRun(
    file: { originalname: string; buffer: Buffer },
    userId: string,
  ) {
    const jsonContent = file.buffer.toString('utf-8')
    const { valid, invalid } = this.parser.parseConversationBatch(jsonContent)

    const runName = this.generateRunName()

    // Create Run
    const run = await this.prisma.run.create({
      data: {
        name: runName,
        status: 'PENDING',
        createdBy: userId,
        totalConversations: valid.length + invalid.length,
        notEvaluableCount: invalid.length,
      },
    })

    // Create valid conversations with messages
    for (const conv of valid) {
      await this.prisma.conversation.create({
        data: {
          runId: run.id,
          sessionId: conv.sessionId,
          conversationDate: conv.date,
          messageCount: conv.messages.length,
          status: 'PENDING',
          messages: {
            create: conv.messages.map((msg) => ({
              role: msg.role === 'customer' ? 'CUSTOMER' : 'AGENT',
              content: msg.content,
              orderIndex: msg.orderIndex,
            })),
          },
        },
      })
    }

    // Create invalid conversations with NOT_EVALUABLE status
    for (const inv of invalid) {
      await this.prisma.conversation.create({
        data: {
          runId: run.id,
          sessionId: inv.raw?.session_id || `unknown_${inv.index}`,
          conversationDate: new Date(),
          messageCount: 0,
          status: 'NOT_EVALUABLE',
          notEvaluableReason: inv.reason,
        },
      })
    }

    return {
      id: run.id,
      name: run.name,
      status: run.status,
      totalConversations: valid.length + invalid.length,
      validCount: valid.length,
      notEvaluableCount: invalid.length,
      createdAt: run.createdAt,
    }
  }

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit
    const [runs, total] = await Promise.all([
      this.prisma.run.findMany({
        where: { createdBy: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          conversations: {
            select: {
              id: true,
              status: true,
              evaluation: {
                select: { label: true },
              },
            },
          },
        },
      }),
      this.prisma.run.count({ where: { createdBy: userId } }),
    ])

    // Transform to include label distribution
    const data = runs.map((run) => {
      const labelDistribution = {
        APROBADA: 0,
        CON_HALLAZGOS: 0,
        FALLIDA: 0,
        NOT_EVALUABLE: 0,
      }
      for (const conv of run.conversations) {
        if (conv.status === 'NOT_EVALUABLE') {
          labelDistribution.NOT_EVALUABLE++
        } else if (conv.evaluation?.label) {
          const label = conv.evaluation.label as string
          if (label in labelDistribution) {
            labelDistribution[label as keyof typeof labelDistribution]++
          }
        }
      }
      const { conversations: _, ...runData } = run
      return { ...runData, labelDistribution }
    })

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async findById(id: string) {
    const run = await this.prisma.run.findUnique({
      where: { id },
      include: {
        _count: {
          select: { conversations: true },
        },
      },
    })
    if (!run) {
      throw new NotFoundException('Run not found')
    }
    return run
  }

  async findLatest(userId: string) {
    const run = await this.prisma.run.findFirst({
      where: { createdBy: userId },
      orderBy: { createdAt: 'desc' },
    })
    if (!run) {
      return null
    }

    // Get label distribution
    const conversations = await this.prisma.conversation.findMany({
      where: { runId: run.id },
      select: {
        status: true,
        evaluation: { select: { label: true } },
      },
    })

    const labelDistribution = {
      APROBADA: 0,
      CON_HALLAZGOS: 0,
      FALLIDA: 0,
      NOT_EVALUABLE: 0,
    }
    for (const conv of conversations) {
      if (conv.status === 'NOT_EVALUABLE') {
        labelDistribution.NOT_EVALUABLE++
      } else if (conv.evaluation?.label) {
        const label = conv.evaluation.label as string
        if (label in labelDistribution) {
          labelDistribution[label as keyof typeof labelDistribution]++
        }
      }
    }

    return { ...run, labelDistribution }
  }

  async getRunSummary(id: string) {
    const run = await this.prisma.run.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        totalConversations: true,
        evaluatedCount: true,
        notEvaluableCount: true,
        failedCount: true,
        aggregateScore: true,
        expiresAt: true,
        createdAt: true,
      },
    })
    if (!run) {
      throw new NotFoundException('Run not found')
    }

    const conversations = await this.prisma.conversation.findMany({
      where: { runId: id },
      select: {
        status: true,
        evaluation: {
          select: { label: true, score: true },
          },
      },
    })

    const labelDistribution = {
      APROBADA: 0,
      CON_HALLAZGOS: 0,
      FALLIDA: 0,
      NOT_EVALUABLE: 0,
    }

    const topFindings: { type: string; count: number }[] = []

    for (const conv of conversations) {
      if (conv.status === 'NOT_EVALUABLE') {
        labelDistribution.NOT_EVALUABLE++
      } else if (conv.evaluation?.label) {
        const label = conv.evaluation.label as string
        if (label in labelDistribution) {
          labelDistribution[label as keyof typeof labelDistribution]++
        }
      }
    }

    // Get top findings across all evaluations in this run
    const findings = await this.prisma.finding.findMany({
      where: {
        evaluation: {
          conversation: { runId: id },
        },
      },
      select: { type: true },
    })

    const findingCounts: Record<string, number> = {}
    for (const f of findings) {
      findingCounts[f.type] = (findingCounts[f.type] || 0) + 1
    }

    const sortedFindings = Object.entries(findingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }))

    return {
      run,
      labelDistribution,
      topFindings: sortedFindings,
    }
  }

  async getRunComparison(runId: string) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: {
        id: true,
        aggregateScore: true,
        createdAt: true,
        createdBy: true,
      },
    })
    if (!run) {
      throw new NotFoundException('Run not found')
    }

    // Get label distribution for the current run
    const currentConversations = await this.prisma.conversation.findMany({
      where: { runId },
      select: {
        status: true,
        evaluation: { select: { label: true } },
      },
    })

    const currentDist = { APROBADA: 0, CON_HALLAZGOS: 0, FALLIDA: 0, NOT_EVALUABLE: 0 }
    for (const conv of currentConversations) {
      if (conv.status === 'NOT_EVALUABLE') {
        currentDist.NOT_EVALUABLE++
      } else if (conv.evaluation?.label) {
        const label = conv.evaluation.label as string
        if (label in currentDist) {
          currentDist[label as keyof typeof currentDist]++
        }
      }
    }

    const current = {
      score: run.aggregateScore,
      aprobadas: currentDist.APROBADA,
      conHallazgos: currentDist.CON_HALLAZGOS,
      fallidas: currentDist.FALLIDA,
      total: currentConversations.length,
    }

    // Find the previous completed run (by createdAt, before the given run)
    const previousRun = await this.prisma.run.findFirst({
      where: {
        createdBy: run.createdBy,
        createdAt: { lt: run.createdAt },
        status: { in: ['COMPLETED', 'COMPLETED_WITH_ERRORS'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        aggregateScore: true,
      },
    })

    if (!previousRun) {
      return { current, previous: null, deltas: null }
    }

    // Get label distribution for the previous run
    const prevConversations = await this.prisma.conversation.findMany({
      where: { runId: previousRun.id },
      select: {
        status: true,
        evaluation: { select: { label: true } },
      },
    })

    const prevDist = { APROBADA: 0, CON_HALLAZGOS: 0, FALLIDA: 0, NOT_EVALUABLE: 0 }
    for (const conv of prevConversations) {
      if (conv.status === 'NOT_EVALUABLE') {
        prevDist.NOT_EVALUABLE++
      } else if (conv.evaluation?.label) {
        const label = conv.evaluation.label as string
        if (label in prevDist) {
          prevDist[label as keyof typeof prevDist]++
        }
      }
    }

    const previous = {
      score: previousRun.aggregateScore,
      aprobadas: prevDist.APROBADA,
      conHallazgos: prevDist.CON_HALLAZGOS,
      fallidas: prevDist.FALLIDA,
      total: prevConversations.length,
    }

    const scoresDelta =
      current.score !== null && previous.score !== null
        ? current.score - previous.score
        : null

    const deltas = {
      score: scoresDelta,
      aprobadas: current.aprobadas - previous.aprobadas,
      conHallazgos: current.conHallazgos - previous.conHallazgos,
      fallidas: current.fallidas - previous.fallidas,
    }

    return { current, previous, deltas }
  }

  async getRunConversations(
    runId: string,
    page = 1,
    limit = 20,
    status?: string,
    label?: string,
  ) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } })
    if (!run) {
      throw new NotFoundException('Run not found')
    }

    const skip = (page - 1) * limit

    const where: any = { runId }
    if (status) {
      where.status = status
    }
    if (label) {
      where.evaluation = { label }
    }

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { conversationDate: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          sessionId: true,
          conversationDate: true,
          status: true,
          messageCount: true,
          notEvaluableReason: true,
          evaluation: {
            select: {
              score: true,
              label: true,
            },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ])

    return {
      data: conversations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }
}
