import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class SharingService {
  constructor(private readonly prisma: PrismaService) {}

  async shareRun(runId: string, userId: string) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      include: { conversations: { select: { id: true } } },
    })
    if (!run) {
      throw new NotFoundException('Run not found')
    }

    // Check if already shared
    const existing = await this.prisma.shareRecord.findFirst({
      where: { runId },
    })
    if (existing) {
      return { alreadyShared: true, runId }
    }

    // Create share record for the run
    await this.prisma.shareRecord.create({
      data: {
        runId,
        sharedBy: userId,
      },
    })

    // Create share records for all conversations in the run
    for (const conv of run.conversations) {
      await this.prisma.shareRecord.create({
        data: {
          conversationId: conv.id,
          sharedBy: userId,
        },
      })
    }

    return { shared: true, runId, conversationsShared: run.conversations.length }
  }

  async shareConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    })
    if (!conversation) {
      throw new NotFoundException('Conversation not found')
    }

    // Check if already shared
    const existing = await this.prisma.shareRecord.findFirst({
      where: { conversationId },
    })
    if (existing) {
      return { alreadyShared: true, conversationId }
    }

    await this.prisma.shareRecord.create({
      data: {
        conversationId,
        sharedBy: userId,
      },
    })

    return { shared: true, conversationId }
  }

  async getSharedRuns(page = 1, limit = 20) {
    const skip = (page - 1) * limit

    // Get distinct run IDs that have been shared
    const shareRecords = await this.prisma.shareRecord.findMany({
      where: { runId: { not: null } },
      select: { runId: true },
      distinct: ['runId'],
    })

    const sharedRunIds = shareRecords.map((sr) => sr.runId!).filter(Boolean)
    const total = sharedRunIds.length

    const runs = await this.prisma.run.findMany({
      where: { id: { in: sharedRunIds } },
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
    })

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

  async getSharedConversations(runId: string, page = 1, limit = 20) {
    // Check if run is shared
    const runShared = await this.prisma.shareRecord.findFirst({
      where: { runId },
    })
    if (!runShared) {
      throw new ForbiddenException('Run is not shared')
    }

    const skip = (page - 1) * limit

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { runId },
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
      this.prisma.conversation.count({ where: { runId } }),
    ])

    return {
      data: conversations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async isShared(runId: string): Promise<boolean> {
    const record = await this.prisma.shareRecord.findFirst({
      where: { runId },
    })
    return !!record
  }

  async isConversationShared(conversationId: string): Promise<boolean> {
    const record = await this.prisma.shareRecord.findFirst({
      where: { conversationId },
    })
    return !!record
  }
}
