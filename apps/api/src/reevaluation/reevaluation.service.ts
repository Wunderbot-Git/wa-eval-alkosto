import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PipelineService } from '../pipeline/pipeline.service'
import { randomUUID } from 'crypto'

export interface ReevaluationFilters {
  status?: string
  label?: string
  findingType?: string
  pattern?: string
}

@Injectable()
export class ReevaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelineService: PipelineService,
  ) {}

  async reevaluateRun(
    originalRunId: string,
    userId: string,
    filters?: ReevaluationFilters,
  ) {
    // 1. Load original run
    const originalRun = await this.prisma.run.findUnique({
      where: { id: originalRunId },
    })
    if (!originalRun) {
      throw new NotFoundException('Original run not found')
    }

    // 2. Build conversation query with optional filters
    const where: any = { runId: originalRunId }
    if (filters?.status) {
      where.status = filters.status
    }
    if (filters?.label) {
      where.evaluation = { ...where.evaluation, label: filters.label }
    }
    if (filters?.findingType) {
      where.evaluation = {
        ...where.evaluation,
        findings: { some: { type: filters.findingType } },
      }
    }
    if (filters?.pattern) {
      where.evaluation = {
        ...where.evaluation,
        patterns: { some: { name: filters.pattern } },
      }
    }

    const conversations = await this.prisma.conversation.findMany({
      where,
      include: {
        messages: { orderBy: { orderIndex: 'asc' } },
      },
    })

    if (conversations.length === 0) {
      throw new NotFoundException('No conversations match the given filters')
    }

    // 3. Create new run
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const newRunName = `REEVAL-${originalRun.name}-${y}${m}${d}`

    const newRun = await this.prisma.run.create({
      data: {
        name: newRunName,
        status: 'PENDING',
        createdBy: userId,
        totalConversations: conversations.length,
      },
    })

    // 4. Copy conversations + messages to new run
    for (const conv of conversations) {
      await this.prisma.conversation.create({
        data: {
          runId: newRun.id,
          sessionId: conv.sessionId,
          conversationDate: conv.conversationDate,
          messageCount: conv.messageCount,
          status: 'PENDING',
          messages: {
            create: conv.messages.map((msg) => ({
              role: msg.role,
              content: msg.content,
              orderIndex: msg.orderIndex,
            })),
          },
        },
      })
    }

    // 5. Queue the new run for evaluation (reuse pipeline)
    await this.pipelineService.launchRun(newRun.id)

    return {
      originalRunId,
      newRunId: newRun.id,
      newRunName,
      conversationsCopied: conversations.length,
      status: 'PROCESSING',
    }
  }
}
